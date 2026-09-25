'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getCurrency } from '@/lib/currency'
import {
  getServerSyncState,
  getSyncState,
  refreshOpenGroups,
  reportStorageError,
  resolveConflict,
  setConnectivity,
  subscribeSync,
  sync,
} from '@/lib/offline/engine'
import { readData, subscribeData } from '@/lib/offline/storage'
import type { Snapshot } from '@/lib/offline/types'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CloudOff } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import superjson from 'superjson'

export function useOfflineStatus() {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState)
}

export function OfflineStatus() {
  const state = useOfflineStatus()
  const client = useQueryClient()
  const [deferred, setDeferred] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [resolving, setResolving] = useState(false)
  // Back online: replace the locally answered queries with server data.
  const wasOffline = useRef(state.offline)
  useEffect(() => {
    if (wasOffline.current && !state.offline) void client.invalidateQueries()
    wasOffline.current = state.offline
  }, [state.offline, client])
  useEffect(() => {
    const stop = subscribeData(() => {
      void client.invalidateQueries()
    })
    const online = () => {
      setConnectivity(true)
      void refreshOpenGroups()
    }
    const offline = () => setConnectivity(false)
    const visible = () => {
      if (document.visibilityState === 'visible') void refreshOpenGroups()
    }
    setConnectivity(navigator.onLine)
    void refreshOpenGroups()
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    // Offline Next.js navigation needs cached documents, not a fresh RSC request.
    const navigate = (event: MouseEvent) => {
      if (
        !getSyncState().offline ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const link = (event.target as Element).closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null
      if (
        !link ||
        link.target ||
        link.download ||
        link.origin !== location.origin ||
        !link.pathname.startsWith('/groups')
      )
        return
      if (/\/expenses\/create$/.test(link.pathname)) {
        event.preventDefault()
        event.stopPropagation()
        window.dispatchEvent(
          new CustomEvent('spliit-open-create', { detail: link.search }),
        )
        return
      }
      const edit = link.pathname.match(/\/expenses\/([^/]+)\/edit$/)
      if (edit) {
        event.preventDefault()
        event.stopPropagation()
        window.dispatchEvent(
          new CustomEvent('spliit-open-edit', { detail: edit[1] }),
        )
        return
      }
      event.preventDefault()
      event.stopPropagation()
      location.assign(link.href)
    }
    document.addEventListener('click', navigate, true)
    const timer = setInterval(visible, 30000)
    return () => {
      stop()
      clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
      document.removeEventListener('click', navigate, true)
    }
  }, [client])
  // The header badge reopens a deferred conflict decision.
  useEffect(() => {
    const reopen = () => setDeferred(null)
    window.addEventListener('spliit-open-conflict', reopen)
    return () => window.removeEventListener('spliit-open-conflict', reopen)
  }, [])
  useEffect(() => {
    if (state.conflict)
      void readData()
        .then((d) => setSnapshot(d.snapshots[state.conflict!.mutation.groupId]))
        .catch(reportStorageError)
  }, [state.conflict])

  const conflict = state.conflict
  const current = conflict?.current
  const local = conflict?.mutation.values
  const names = (id: string) =>
    snapshot?.group.participants.find((p) => p.id === id)?.name ?? id
  const amount = (n?: number) =>
    n == null
      ? '–'
      : snapshot
      ? formatCurrency(getCurrencyFromGroup(snapshot.group), n, 'de-DE')
      : String(n)
  // Original amounts are stored in minor units of their own currency.
  const original = (n?: number | null, code?: string | null) =>
    n == null ? '–' : formatCurrency(getCurrency(code), n, 'de-DE')
  const rows = conflict
    ? [
        ['Titel', current?.title, local?.title],
        ['Betrag', amount(current?.amount), amount(local?.amount)],
        [
          'Datum',
          current?.expenseDate.toISOString().slice(0, 10),
          local?.expenseDate.toISOString().slice(0, 10),
        ],
        [
          'Bezahlt von',
          current && names(current.paidById),
          local && names(local.paidBy),
        ],
        [
          'Aufteilung',
          current &&
            `${current.splitMode}: ${current.paidFor
              .map((p) => `${names(p.participantId)} (${p.shares})`)
              .join(', ')}`,
          local &&
            `${local.splitMode}: ${local.paidFor
              .map((p) => `${names(p.participant)} (${p.shares})`)
              .join(', ')}`,
        ],
        [
          'Kategorie',
          current?.category?.name,
          snapshot?.categories.find((c) => c.id === local?.category)?.name,
        ],
        ['Notiz', current?.notes, local?.notes],
        ['Ort', current?.locationName, local?.locationName],
        [
          'Koordinaten',
          current && `${current.latitude ?? ''}, ${current.longitude ?? ''}`,
          local && `${local.latitude ?? ''}, ${local.longitude ?? ''}`,
        ],
        ['Wiederholung', current?.recurrenceRule, local?.recurrenceRule],
        [
          'Erstattung',
          current?.isReimbursement ? 'Ja' : 'Nein',
          local?.isReimbursement ? 'Ja' : 'Nein',
        ],
        [
          'Originalbetrag / Kurs',
          current &&
            `${original(current.originalAmount, current.originalCurrency)} / ${
              current.conversionRate ?? ''
            }`,
          local &&
            `${original(local.originalAmount, local.originalCurrency)} / ${
              local.conversionRate ?? ''
            }`,
        ],
        [
          'Belege',
          current?.documents.map((d) => d.url).join(', '),
          local?.documents.map((d) => d.url).join(', '),
        ],
      ].filter(
        (row) => row[1] !== row[2] || row[0] === 'Titel' || row[0] === 'Betrag',
      )
    : []

  const resolve = async (keep: boolean) => {
    setResolving(true)
    try {
      await resolveConflict(keep)
    } catch (error) {
      reportStorageError(error)
    } finally {
      setResolving(false)
    }
  }
  return (
    <>
      <Dialog
        open={!!conflict && deferred !== conflict.mutation.id}
        onOpenChange={(open) => {
          if (!open && conflict && !resolving) setDeferred(conflict.mutation.id)
        }}
      >
        <DialogContent
          className="z-[200] max-h-[85dvh] overflow-y-auto sm:max-w-xl"
          aria-describedby="offline-conflict-description"
        >
          <DialogHeader>
            <DialogTitle>Diese Ausgabe wurde auch online geändert</DialogTitle>
            <DialogDescription id="offline-conflict-description">
              {current
                ? 'Entscheide, welchen Stand du behalten möchtest.'
                : 'Die Ausgabe wurde online gelöscht. Deine Änderung kann sie wiederherstellen.'}{' '}
              Bis zur Entscheidung bleibt deine Änderung auf diesem Gerät
              gespeichert.
            </DialogDescription>
          </DialogHeader>
          {conflict?.mutation.kind === 'delete' ? (
            <p className="text-sm">
              Deine lokale Änderung: „{current?.title ?? 'Ausgabe'}“ löschen.
              Der Online-Stand wurde inzwischen geändert.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <strong>Online-Stand</strong>
              <strong>Meine Änderung</strong>
              {rows.map(([label, online, offline]) => (
                <div
                  className="col-span-2 grid grid-cols-2 gap-3 border-t pt-2"
                  key={label}
                >
                  <div className="min-w-0 break-words">
                    <span className="block text-xs text-muted-foreground">
                      {label}
                    </span>
                    {current ? online || '–' : 'Gelöscht'}
                  </div>
                  <div className="min-w-0 break-words">
                    <span className="block text-xs text-muted-foreground">
                      {label}
                    </span>
                    {offline || '–'}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            „Online-Stand behalten“ verwirft alle ausstehenden lokalen
            Änderungen an dieser Ausgabe. Andere Ausgaben bleiben erhalten.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              disabled={resolving}
              onClick={() => void resolve(false)}
            >
              Online-Stand behalten
            </Button>
            <Button
              disabled={resolving || state.offline}
              onClick={() => void resolve(true)}
            >
              {conflict?.mutation.kind === 'delete'
                ? 'Trotzdem löschen'
                : current
                ? 'Meine Änderung übernehmen'
                : 'Ausgabe wiederherstellen'}
            </Button>
            <Button
              variant="ghost"
              disabled={resolving}
              onClick={() => conflict && setDeferred(conflict.mutation.id)}
            >
              Später entscheiden
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

async function exportPending() {
  const data = await readData()
  const url = URL.createObjectURL(
    new Blob([superjson.stringify(data)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'spliit-offline-sicherung.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const changes = (n: number) => `${n} Änderung${n === 1 ? '' : 'en'}`

// Header badge: invisible while everything works online. Offline it says so;
// sync problems and pending conflict decisions are shown the same way.
export function OfflineBadge() {
  const state = useOfflineStatus()
  const badge = state.conflict
    ? {
        label: 'Entscheidung nötig',
        className:
          'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
        icon: AlertCircle,
      }
    : state.error
    ? {
        label: 'Sync-Fehler',
        className:
          'bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200',
        icon: AlertCircle,
      }
    : state.offline
    ? {
        label: 'Offline',
        className:
          'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
        icon: CloudOff,
      }
    : null
  if (!badge) return null
  const Icon = badge.icon
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="offline-status"
          className={cn(
            'mr-1 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
            badge.className,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {badge.label}
          {state.pending > 0 && (
            <span className="rounded-full bg-black/10 px-1.5 tabular-nums dark:bg-white/15">
              {state.pending}
              <span className="sr-only"> {changes(state.pending)}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-sm">
        {state.conflict ? (
          <>
            <p className="font-medium">Abgleich braucht eine Entscheidung</p>
            <p className="text-muted-foreground">
              Eine Ausgabe wurde auch online geändert. Deine Version bleibt
              gespeichert, bis du entschieden hast.
            </p>
            <Button
              size="sm"
              onClick={() =>
                window.dispatchEvent(new Event('spliit-open-conflict'))
              }
            >
              Jetzt prüfen
            </Button>
          </>
        ) : state.error ? (
          <>
            <p className="font-medium">Abgleich fehlgeschlagen</p>
            <p className="text-muted-foreground">{state.error}</p>
            {state.pending > 0 && (
              <p className="text-muted-foreground">
                {changes(state.pending)}{' '}
                {state.pending === 1 ? 'bleibt' : 'bleiben'} sicher auf diesem
                Gerät gespeichert.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void sync()}>
                Erneut versuchen
              </Button>
              {state.pending > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void exportPending().catch(reportStorageError)}
                >
                  Als Datei sichern
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="font-medium">Du bist offline</p>
            <p className="text-muted-foreground">
              {state.pending
                ? `${changes(state.pending)} ${
                    state.pending === 1 ? 'ist' : 'sind'
                  } auf diesem Gerät gespeichert und ${
                    state.pending === 1 ? 'wird' : 'werden'
                  } automatisch übertragen, sobald du wieder online bist. ${
                    state.pending === 1 ? 'Sie ist' : 'Sie sind'
                  } in der Liste markiert.`
                : 'Du siehst den zuletzt gespeicherten Stand. Neue Ausgaben kannst du trotzdem erfassen – sie werden später übertragen.'}
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

// IDs of expenses with local changes that have not reached the server yet.
// Only reported while that is noteworthy (offline or sync blocked), so a
// normal online save does not flash a marker.
export function usePendingExpenseIds(groupId: string) {
  const state = useOfflineStatus()
  const [ids, setIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    let live = true
    const read = () =>
      readData()
        .then((data) => {
          if (live)
            setIds(
              new Set(
                data.queue
                  .filter((m) => m.groupId === groupId)
                  .map((m) => m.expenseId),
              ),
            )
        })
        .catch(() => {})
    void read()
    const stop = subscribeData(() => void read())
    return () => {
      live = false
      stop()
    }
  }, [groupId, state.pending])
  const visible = state.offline || !!state.error || !!state.conflict
  return visible ? ids : EMPTY_IDS
}
const EMPTY_IDS = new Set<string>()
