'use client'

import {
  getBalances,
  getPublicBalances,
  getSuggestedReimbursements,
} from '@/lib/balances'
import type { AppRouter } from '@/trpc/routers/_app'
import { TRPCClientError, createTRPCClient, httpLink } from '@trpc/client'
import superjson from 'superjson'
import { v4 as uuid } from 'uuid'
import { listExpenses, localQuery, project } from './projection'
import { changeData, readData } from './storage'
import {
  currencyIdentity,
  mutationSchema,
  type PendingMutation,
  type Snapshot,
  type StoredExpense,
} from './types'

const remote = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
      transformer: superjson,
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    }),
  ],
})

export type SyncState = {
  offline: boolean
  syncing: boolean
  pending: number
  lastSynced: number | null
  preparing: boolean
  error: string | null
  conflict: { mutation: PendingMutation; current: StoredExpense | null } | null
}
let state: SyncState = {
  offline: false,
  syncing: false,
  pending: 0,
  lastSynced: null,
  preparing: false,
  error: null,
  conflict: null,
}
const listeners = new Set<() => void>()
export const subscribeSync = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getSyncState = () => state
export const getServerSyncState = () => SERVER_STATE
const SERVER_STATE = state
function status(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}
export function setConnectivity(online: boolean) {
  status({ offline: !online })
  if (online) void sync()
}
export function reportStorageError(error: unknown) {
  status({
    error:
      error instanceof Error
        ? error.message
        : 'Lokaler Speicher nicht verfügbar.',
  })
}
const preparing = new Map<string, Promise<Snapshot>>()
const warmed = new Set<string>()

async function warmPages(groupId: string) {
  if (
    !navigator.onLine ||
    !('serviceWorker' in navigator) ||
    warmed.has(groupId)
  )
    return
  warmed.add(groupId)
  status({ preparing: true })
  try {
    const reg = await navigator.serviceWorker.ready
    const paths = [
      '/groups',
      `/groups/${groupId}`,
      ...[
        'expenses',
        'balances',
        'stats',
        'activity',
        'edit',
        'information',
      ].map((path) => `/groups/${groupId}/${path}`),
    ]
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel()
      const finish = () => {
        clearTimeout(timer)
        channel.port1.close()
        resolve()
      }
      const timer = setTimeout(() => {
        warmed.delete(groupId)
        finish()
      }, 30000)
      channel.port1.onmessage = (event) => {
        if (event.data.failed?.length) warmed.delete(groupId)
        finish()
      }
      reg.active?.postMessage({ type: 'WARM_URLS', paths }, [channel.port2])
    })
  } catch {
    warmed.delete(groupId)
  } finally {
    status({ preparing: false })
  }
}

export async function refreshSnapshot(groupId: string) {
  const existing = preparing.get(groupId)
  if (existing) return existing
  const task = (async () => {
    const startedAt = Date.now()
    const snapshot = await remote.offline.snapshot.query({ groupId })
    snapshot.savedAt = startedAt
    await changeData((data) => {
      if (
        !data.snapshots[groupId] ||
        data.snapshots[groupId].savedAt <= startedAt
      )
        data.snapshots[groupId] = snapshot
    })
    status({ offline: false })
    void warmPages(groupId)
    return snapshot
  })().finally(() => preparing.delete(groupId))
  preparing.set(groupId, task)
  return task
}

export async function offlineQuery(path: string, input: Record<string, any>) {
  let data = await readData()
  if (path === 'groups.list') {
    if (!state.offline && navigator.onLine) return undefined
    return {
      groups: (input.groupIds as string[]).flatMap((id) => {
        const saved = data.snapshots[id]
        if (!saved) return []
        const snapshot = project(saved, data.queue)
        return [
          {
            ...snapshot.group,
            createdAt: snapshot.group.createdAt.toISOString(),
            _count: { participants: snapshot.group.participants.length },
            balances: getPublicBalances(
              getSuggestedReimbursements(getBalances(listExpenses(snapshot))),
            ),
          },
        ]
      }),
    }
  }
  const groupId = input.groupId
  if (!groupId || !(path.startsWith('groups.') || path === 'categories.list'))
    return undefined
  if (!data.snapshots[groupId]) {
    if (!navigator.onLine)
      throw new Error(
        'Diese Gruppe ist noch nicht offline gespeichert. Bitte einmal online öffnen.',
      )
    await refreshSnapshot(groupId)
    data = await readData()
  } else if (
    path === 'groups.get' &&
    navigator.onLine &&
    !state.offline &&
    Date.now() - data.snapshots[groupId].savedAt > 30000
  ) {
    void refreshSnapshot(groupId).catch(() => status({ offline: true }))
  }
  void warmPages(groupId)
  return localQuery(path, input, project(data.snapshots[groupId], data.queue))
}

export async function enqueue(path: string, input: Record<string, any>) {
  const data = await readData()
  const saved = data.snapshots[input.groupId]
  if (!saved)
    throw new Error(
      'Gruppe noch nicht offline bereit. Bitte kurz online öffnen und erneut versuchen.',
    )
  const snapshot = project(saved, data.queue)
  const kind = path.split('.').at(-1) as PendingMutation['kind']
  const expenseId = kind === 'create' ? uuid() : input.expenseId
  const current = snapshot.expenses.find((e) => e.id === expenseId)
  if (kind !== 'create' && !current)
    throw new Error('Ausgabe nicht lokal vorhanden. Bitte neu laden.')
  const mutation = mutationSchema.parse({
    id: uuid(),
    kind,
    expenseId,
    groupId: input.groupId,
    baseVersion: input.baseVersion ?? current?.syncVersion ?? null,
    groupCurrency: currencyIdentity(snapshot.group),
    values: input.expenseFormValues,
    participantId: input.participantId,
    localTime: Date.now(),
  })
  await changeData((draft) => {
    draft.queue.push(mutation)
  })
  status({ pending: (await readData()).queue.length, error: null })
  void navigator.storage?.persist?.().catch(() => false)
  void sync()
  return kind === 'delete' ? {} : { expenseId }
}

let running: Promise<void> | undefined
export async function sync() {
  if (running) return running
  const run = async () => {
    status({ pending: (await readData()).queue.length })
    if (!navigator.onLine) {
      status({ offline: true })
      return
    }
    if (state.conflict) return
    status({ syncing: true, error: null })
    let applied = false
    const touched = new Set<string>()
    try {
      while (true) {
        const mutation = (await readData()).queue[0]
        if (!mutation) break
        const result = await remote.offline.commit.mutate(mutation)
        status({ offline: false })
        if (result.status === 'conflict') {
          status({ conflict: { mutation, current: result.current } })
          return
        }
        // Commit the acknowledgement and local base in the SAME durable transaction.
        await changeData((draft) => {
          if (draft.queue.some((m) => m.id === mutation.id)) {
            const snapshot = draft.snapshots[mutation.groupId]
            if (snapshot)
              draft.snapshots[mutation.groupId] = {
                ...project(snapshot, [mutation]),
                savedAt: Date.now(),
              }
            draft.queue = draft.queue.filter((m) => m.id !== mutation.id)
          }
        })
        touched.add(mutation.groupId)
        applied = true
        status({ pending: (await readData()).queue.length })
      }
      for (const groupId of Array.from(touched)) await refreshSnapshot(groupId)
      if (applied) status({ lastSynced: Date.now() })
    } catch (error) {
      // A missing response is not proof of failure: keep the same operation ID for retry.
      if (error instanceof TRPCClientError && error.data?.code) {
        status({
          error:
            error.data.code === 'INTERNAL_SERVER_ERROR'
              ? 'Serverfehler beim Abgleich. Änderungen bleiben auf diesem Gerät gespeichert.'
              : error.message,
        })
      } else {
        status({ offline: true })
      }
    } finally {
      status({ syncing: false, pending: (await readData()).queue.length })
    }
  }
  running = (
    navigator.locks ? navigator.locks.request('spliit-sync-v1', run) : run()
  )
    .catch(reportStorageError)
    .finally(() => {
      running = undefined
    })
  return running
}

export async function resolveConflict(keepLocal: boolean) {
  const conflict = state.conflict
  if (!conflict) return
  const choose = () =>
    changeData((draft) => {
      const { mutation, current } = conflict
      const pending = draft.queue.find((m) => m.id === mutation.id)
      if (!pending || pending.baseVersion !== mutation.baseVersion) return
      if (keepLocal) {
        // Only approve the version SHOWN to the user; another concurrent edit prompts again.
        pending.baseVersion = current?.syncVersion ?? null
      } else {
        draft.queue = draft.queue.filter(
          (m) =>
            m.groupId !== mutation.groupId ||
            m.expenseId !== mutation.expenseId,
        )
        const snapshot = draft.snapshots[mutation.groupId]
        snapshot.expenses = snapshot.expenses.filter(
          (e) => e.id !== mutation.expenseId,
        )
        if (current) snapshot.expenses.push(current)
      }
    })
  if (navigator.locks) await navigator.locks.request('spliit-sync-v1', choose)
  else await choose()
  status({ conflict: null, error: null })
  await sync()
}

export async function refreshOpenGroups() {
  await sync()
  if (!navigator.onLine || state.error || state.conflict) return
  const data = await readData()
  const match = location.pathname.match(/^\/groups\/([^/]+)/)
  if (match && data.snapshots[match[1]]) {
    try {
      await refreshSnapshot(match[1])
    } catch {
      status({ offline: true })
    }
  }
}
