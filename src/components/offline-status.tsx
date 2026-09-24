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
  getServerSyncState,
  getSyncState,
  refreshOpenGroups,
  reportStorageError,
  resolveConflict,
  setConnectivity,
  subscribeSync,
  sync,
} from '@/lib/offline/engine'
import {
  getReadiness,
  getServerReadiness,
  subscribeReadiness,
} from '@/lib/offline/readiness'
import { readData, subscribeData } from '@/lib/offline/storage'
import type { Snapshot } from '@/lib/offline/types'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronUp,
  CloudOff,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import superjson from 'superjson'

const TONES = {
  offline:
    'border-amber-300/70 bg-amber-50/95 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/90 dark:text-amber-50',
  syncing:
    'border-sky-200 bg-sky-50/95 text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/90 dark:text-sky-50',
  success:
    'border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/90 dark:text-emerald-50',
  warning:
    'border-amber-300/70 bg-amber-50/95 text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/90 dark:text-amber-50',
  error:
    'border-red-200 bg-red-50/95 text-red-900 dark:border-red-400/30 dark:bg-red-950/90 dark:text-red-50',
  neutral: 'bg-background/95 text-muted-foreground',
}

export function useOfflineStatus() {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState)
}

export function OfflineStatus() {
  const state = useOfflineStatus()
  const pathname = usePathname()
  const groupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? ''
  const files = useSyncExternalStore(
    subscribeReadiness,
    () => getReadiness(groupId),
    getServerReadiness,
  )
  const client = useQueryClient()
  const [recent, setRecent] = useState(false)
  const [deferred, setDeferred] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [resolving, setResolving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Explain the offline mode once per session (offline tab changes reload
  // the page), then keep the pill compact.
  useEffect(() => {
    setExpanded(false)
    if (!state.offline || sessionStorage.getItem('spliit-offline-explained'))
      return
    sessionStorage.setItem('spliit-offline-explained', '1')
    setExpanded(true)
    const timer = setTimeout(() => setExpanded(false), 6000)
    return () => clearTimeout(timer)
  }, [state.offline])
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
  useEffect(() => {
    if (!state.lastSynced) return
    setRecent(true)
    const timer = setTimeout(() => setRecent(false), 5000)
    return () => clearTimeout(timer)
  }, [state.lastSynced])
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
            `${current.originalAmount ?? ''} ${
              current.originalCurrency ?? ''
            } / ${current.conversionRate ?? ''}`,
          local &&
            `${local.originalAmount ?? ''} ${local.originalCurrency ?? ''} / ${
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
  const exportPending = async () => {
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
  const pill: {
    tone: keyof typeof TONES
    icon: typeof CloudOff
    title: string
    detail?: string
    spin?: boolean
  } | null = state.conflict
    ? {
        tone: 'warning',
        icon: AlertCircle,
        title: 'Abgleich benötigt eine Entscheidung',
        detail:
          'Eine Ausgabe wurde auch online geändert. Deine Version bleibt gespeichert, bis du entschieden hast.',
      }
    : state.error
    ? {
        tone: 'error',
        icon: AlertCircle,
        title: state.error,
        detail: state.pending
          ? `${changes(state.pending)} ${
              state.pending === 1 ? 'bleibt' : 'bleiben'
            } sicher auf diesem Gerät gespeichert.`
          : undefined,
      }
    : state.offline
    ? {
        tone: 'offline',
        icon: CloudOff,
        title: 'Offline',
        detail: state.pending
          ? 'Deine Änderungen sind auf diesem Gerät gespeichert und werden automatisch übertragen, sobald du wieder online bist.'
          : 'Du siehst den zuletzt gespeicherten Stand. Neue Ausgaben kannst du trotzdem erfassen – sie werden später übertragen.',
      }
    : state.pending
    ? {
        tone: 'syncing',
        icon: state.syncing ? Loader2 : RefreshCw,
        spin: state.syncing,
        title: state.syncing
          ? `${changes(state.pending)} werden abgeglichen …`
          : `${changes(state.pending)} warten auf Abgleich`,
      }
    : recent
    ? { tone: 'success', icon: CheckCircle2, title: 'Alles synchronisiert' }
    : files.preparing
    ? {
        tone: 'neutral',
        icon: Loader2,
        spin: true,
        title: 'Offline-Kopie wird gespeichert …',
      }
    : files.error
    ? {
        tone: 'neutral',
        icon: CloudOff,
        title: 'Offline-Kopie unvollständig',
        detail:
          'Details und Reparatur findest du in den Gruppeneinstellungen unter „Offline-Verfügbarkeit“.',
      }
    : null
  const Icon = pill?.icon ?? Check
  const showDetail = Boolean(pill?.detail && expanded)
  return (
    <>
      {pill && (
        <div className="pointer-events-none fixed inset-x-3 bottom-24 z-[60] flex justify-center md:bottom-4">
          <div
            className={cn(
              'pointer-events-auto max-w-md rounded-2xl border px-3.5 py-2 text-sm shadow-lg backdrop-blur transition-colors',
              TONES[pill.tone],
            )}
            role="status"
            aria-live="polite"
            data-testid="offline-status"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left disabled:cursor-default"
              disabled={!pill.detail}
              aria-expanded={pill.detail ? showDetail : undefined}
              onClick={() => setExpanded((open) => !open)}
            >
              <Icon
                className={cn('h-4 w-4 shrink-0', pill.spin && 'animate-spin')}
              />
              <span className="font-medium">{pill.title}</span>
              {state.offline && !state.conflict && !state.error && (
                <span className="whitespace-nowrap rounded-full bg-black/5 px-2 dark:bg-white/10 py-0.5 text-xs font-medium">
                  <span className="opacity-90">
                    {state.pending
                      ? `${changes(state.pending)} lokal`
                      : 'Lokaler Stand'}
                  </span>
                </span>
              )}
              {pill.detail && (
                <ChevronUp
                  className={cn(
                    'ml-auto h-4 w-4 shrink-0 opacity-60 transition-transform',
                    !showDetail && 'rotate-180',
                  )}
                />
              )}
            </button>
            {showDetail && (
              <p className="mt-1.5 text-xs leading-relaxed opacity-80">
                {pill.detail}
              </p>
            )}
            {(state.conflict || state.error) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
                {state.conflict && (
                  <button
                    className="underline underline-offset-2"
                    onClick={() => setDeferred(null)}
                  >
                    Prüfen
                  </button>
                )}
                {state.error && (
                  <button
                    className="underline underline-offset-2"
                    onClick={() => void sync()}
                  >
                    Erneut versuchen
                  </button>
                )}
                {state.error && state.pending > 0 && (
                  <button
                    className="underline underline-offset-2"
                    onClick={() =>
                      void exportPending().catch(reportStorageError)
                    }
                  >
                    Lokale Änderungen als Datei sichern
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
