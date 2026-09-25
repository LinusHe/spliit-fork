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
import { warmPages } from './readiness'
import { changeData, readData } from './storage'
import {
  currencyIdentity,
  mutationSchema,
  type OfflineData,
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
// Bumped on every browser online/offline event. A request that was started
// before the latest event must not override what that event reported.
let epoch = 0
export function setConnectivity(online: boolean) {
  epoch++
  status({ offline: !online })
  if (online) void sync()
}
// navigator.onLine only knows whether an interface is up. iOS PWAs in
// particular keep reporting "online" with no usable connection (weak cellular,
// captive WiFi), so a failed request is the real signal.
export const isOffline = () => !navigator.onLine || state.offline
function markOffline(since: number) {
  if (since === epoch && !state.offline) status({ offline: true })
}
// A cheap request that the service worker never answers from its cache.
async function probe() {
  try {
    const response = await fetch(`/version.json?probe=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    return response.ok
  } catch {
    return false
  }
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

export async function refreshSnapshot(groupId: string) {
  const existing = preparing.get(groupId)
  if (existing) return existing
  const task = (async () => {
    const startedAt = Date.now()
    const since = epoch
    const snapshot = await remote.offline.snapshot
      .query({ groupId })
      .catch((error) => {
        if (!(error instanceof TRPCClientError && error.data?.code))
          markOffline(since)
        throw error
      })
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

function groupSummary(saved: Snapshot, queue: PendingMutation[]) {
  const snapshot = project(saved, queue)
  return {
    ...snapshot.group,
    createdAt: snapshot.group.createdAt.toISOString(),
    _count: { participants: snapshot.group.participants.length },
    balances: getPublicBalances(
      getSuggestedReimbursements(getBalances(listExpenses(snapshot))),
    ),
  }
}

// The group list is the PWA start page: answer from the device immediately and
// refresh in the background. This also keeps every recent group offline-ready
// without the user having to open each one.
async function listGroups(groupIds: string[], data: OfflineData) {
  const local = groupIds.flatMap((id) =>
    data.snapshots[id] ? [groupSummary(data.snapshots[id], data.queue)] : [],
  )
  if (isOffline()) return { groups: local }
  void refreshGroups(groupIds.filter((id) => data.snapshots[id]))
  const missing = groupIds.filter((id) => !data.snapshots[id])
  if (!missing.length) return { groups: local }
  const since = epoch
  const fetching = remote.groups.list
    .query({ groupIds: missing })
    .then(({ groups }) => {
      // Stored groups replace these server summaries via the data listener.
      for (const group of groups) void refreshSnapshot(group.id).catch(() => {})
      return [...local, ...groups]
    })
    .catch((error) => {
      if (!(error instanceof TRPCClientError && error.data?.code))
        markOffline(since)
      return local
    })
  // Never keep the start page waiting on a weak connection once some groups
  // are on the device; the rest appear as soon as they are stored.
  return { groups: local.length ? local : await fetching }
}

let refreshing: Promise<void> | undefined
async function refreshGroups(groupIds: string[]) {
  if (refreshing) return
  refreshing = (async () => {
    const data = await readData()
    for (const id of groupIds) {
      if (isOffline()) return
      if (Date.now() - (data.snapshots[id]?.savedAt ?? 0) < 30000) continue
      await refreshSnapshot(id).catch(() => {})
    }
  })().finally(() => {
    refreshing = undefined
  })
}

export async function offlineQuery(path: string, input: Record<string, any>) {
  let data = await readData()
  if (path === 'groups.list') return listGroups(input.groupIds, data)
  const groupId = input.groupId
  if (!groupId || !(path.startsWith('groups.') || path === 'categories.list'))
    return undefined
  if (!data.snapshots[groupId]) {
    if (isOffline())
      throw new Error(
        'Diese Gruppe ist noch nicht offline gespeichert. Bitte einmal online öffnen.',
      )
    await refreshSnapshot(groupId)
    data = await readData()
  } else if (
    path === 'groups.get' &&
    !isOffline() &&
    Date.now() - data.snapshots[groupId].savedAt > 30000
  ) {
    void refreshSnapshot(groupId).catch(() => {})
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
  // The form mints the id of a new expense (its split preview depends on it).
  const expenseId =
    kind === 'create' ? input.expenseId ?? uuid() : input.expenseId
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
    const since = epoch
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
        markOffline(since)
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
  // Trust a real request over navigator.onLine, in both directions.
  if (navigator.onLine) {
    const since = epoch
    const reachable = await probe()
    if (since === epoch && reachable === state.offline)
      status({ offline: !reachable })
  }
  await sync()
  if (isOffline() || state.error || state.conflict) return
  const data = await readData()
  const match = location.pathname.match(/^\/groups\/([^/]+)/)
  if (match && data.snapshots[match[1]]) {
    await refreshSnapshot(match[1]).catch(() => {})
  }
}
