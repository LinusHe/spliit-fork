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
import { readData, subscribeData } from '@/lib/offline/storage'
import type { Snapshot } from '@/lib/offline/types'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import superjson from 'superjson'

export function useOfflineStatus() {
  return useSyncExternalStore(subscribeSync, getSyncState, getServerSyncState)
}

export function OfflineStatus() {
  const state = useOfflineStatus()
  const client = useQueryClient()
  const [recent, setRecent] = useState(false)
  const [deferred, setDeferred] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [resolving, setResolving] = useState(false)
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

  const label = state.conflict
    ? 'Abgleich benötigt eine Entscheidung'
    : state.error
    ? state.error
    : state.offline
    ? `Offline${
        state.pending
          ? ` · ${state.pending} Änderung${
              state.pending === 1 ? '' : 'en'
            } auf diesem Gerät`
          : ' · lokal gespeicherter Stand'
      }`
    : state.syncing && state.pending
    ? `${state.pending} Änderung${
        state.pending === 1 ? '' : 'en'
      } werden abgeglichen …`
    : state.pending
    ? `${state.pending} Änderung${
        state.pending === 1 ? '' : 'en'
      } warten auf Abgleich`
    : recent
    ? 'Alles synchronisiert'
    : null

  const shownLabel =
    label ?? (state.preparing ? 'Offline-Ansicht wird vorbereitet …' : null)
  return (
    <>
      {shownLabel && (
        <div
          className="fixed bottom-24 md:bottom-4 left-3 right-3 z-[60] mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-lg border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur"
          role="status"
          aria-live="polite"
          data-testid="offline-status"
        >
          <div className="flex items-center gap-2">
            {state.conflict || state.error ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            ) : state.offline ? (
              <CloudOff className="h-3.5 w-3.5 shrink-0" />
            ) : state.syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Check className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{shownLabel}</span>
            {state.conflict && (
              <button
                className="underline whitespace-nowrap"
                onClick={() => setDeferred(null)}
              >
                Prüfen
              </button>
            )}
            {state.error && (
              <button
                className="underline whitespace-nowrap"
                onClick={() => void sync()}
              >
                Erneut versuchen
              </button>
            )}
          </div>
          {state.error && state.pending > 0 && (
            <button
              className="mt-1 underline"
              onClick={() => void exportPending().catch(reportStorageError)}
            >
              Lokale Änderungen als Datei sichern
            </button>
          )}
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
