'use client'

import { useOfflineStatus } from '@/components/offline-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { refreshSnapshot } from '@/lib/offline/engine'
import {
  checkOfflineReadiness,
  getReadiness,
  getServerReadiness,
  subscribeReadiness,
} from '@/lib/offline/readiness'
import { readData, subscribeData } from '@/lib/offline/storage'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  CloudOff,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

export function GroupOfflineSettings({ groupId }: { groupId: string }) {
  const sync = useOfflineStatus()
  const files = useSyncExternalStore(
    subscribeReadiness,
    () => getReadiness(groupId),
    getServerReadiness,
  )
  const [data, setData] = useState<{
    savedAt: number
    expenses: number
    pending: number
  }>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let live = true
    const read = async () => {
      try {
        const stored = await readData()
        const snapshot = stored.snapshots[groupId]
        if (live) {
          setData(
            snapshot
              ? {
                  savedAt: snapshot.savedAt,
                  expenses: snapshot.expenses.length,
                  pending: stored.queue.filter((m) => m.groupId === groupId)
                    .length,
                }
              : undefined,
          )
          setError(undefined)
        }
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : 'Lokaler Speicher nicht lesbar.',
          )
      }
    }
    const check = () => {
      void read()
      void checkOfflineReadiness(groupId)
      void navigator.serviceWorker?.getRegistration().then((reg) => {
        if (live) setUpdateAvailable(Boolean(reg?.waiting))
      })
    }
    check()
    const stop = subscribeData(() => {
      void read()
    })
    const timer = setInterval(check, 15000)
    window.addEventListener('spliit-update-ready', check)
    return () => {
      live = false
      stop()
      clearInterval(timer)
      window.removeEventListener('spliit-update-ready', check)
    }
  }, [groupId])

  const prepare = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await refreshSnapshot(groupId)
      await checkOfflineReadiness(groupId, true, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Vorbereitung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const update = async () => {
    if (!navigator.onLine || (await readData()).queue.length) return
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    const installing = reg?.installing
    if (installing)
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          if (
            installing.state !== 'installed' &&
            installing.state !== 'redundant'
          )
            return
          clearTimeout(timer)
          installing.removeEventListener('statechange', done)
          resolve()
        }
        const timer = setTimeout(() => {
          installing.removeEventListener('statechange', done)
          reject(new Error('Update noch nicht bereit'))
        }, 15000)
        installing.addEventListener('statechange', done)
        done()
      })
    if ((await readData()).queue.length) return
    if (reg?.waiting) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => location.reload(),
        { once: true },
      )
      reg.waiting.postMessage('SKIP_WAITING')
    } else location.reload()
  }
  const ready = Boolean(data && files.ready && !error)
  // Periodic re-checks keep the last result on screen instead of flickering.
  const working =
    busy || files.preparing || (files.checking && !files.checkedAt)
  const StatusIcon = working ? Loader2 : ready ? CheckCircle2 : CloudOff
  const count = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`
  return (
    <Card data-testid="group-offline-settings">
      <CardHeader>
        <CardTitle className="text-xl">Offline-Verfügbarkeit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div
          className={cn(
            'flex gap-3 rounded-lg border p-3',
            working
              ? 'bg-muted/40'
              : ready
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-950/40'
              : 'border-amber-300/70 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-950/40',
          )}
        >
          <StatusIcon
            className={cn(
              'mt-0.5 h-5 w-5 shrink-0',
              working
                ? 'animate-spin text-muted-foreground'
                : ready
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400',
            )}
          />
          <div className="min-w-0 space-y-0.5">
            <p
              role="status"
              data-testid="group-offline-ready"
              className="font-medium"
            >
              {busy || files.preparing
                ? 'Offline-Kopie wird gespeichert …'
                : files.checking && !files.checkedAt
                ? 'Offline-Verfügbarkeit wird geprüft …'
                : ready
                ? 'Auf diesem Gerät offline bereit'
                : 'Noch nicht vollständig offline verfügbar'}
            </p>
            <p className="text-muted-foreground">
              {data
                ? `${count(
                    data.expenses,
                    'Ausgabe',
                    'Ausgaben',
                  )} gespeichert · Stand ${ago(data.savedAt)}`
                : 'Gruppendaten noch nicht auf diesem Gerät gespeichert'}
            </p>
            {!ready && !working && files.missing?.length ? (
              <p className="text-muted-foreground">
                {count(
                  files.missing.length,
                  'Seite/Datei fehlt',
                  'Seiten/Dateien fehlen',
                )}{' '}
                – mit Internet „Offline-Kopie aktualisieren“ tippen.
              </p>
            ) : null}
          </div>
        </div>
        {data?.pending ? (
          <p className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <RefreshCw className="h-4 w-4 shrink-0" />
            {data.pending === 1
              ? '1 lokale Änderung wartet auf Übertragung'
              : `${data.pending} lokale Änderungen warten auf Übertragung`}
          </p>
        ) : null}
        {(error || files.error) && (
          <p role="alert" className="text-destructive">
            {error || files.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={sync.offline || busy || files.checking}
            onClick={() => void prepare()}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Offline-Kopie aktualisieren
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || files.checking}
            onClick={() => void checkOfflineReadiness(groupId)}
          >
            Offline-Stand prüfen
          </Button>
          {(updateAvailable || files.error) && (
            <Button
              size="sm"
              variant="outline"
              disabled={sync.offline || sync.pending > 0}
              onClick={() =>
                void update().catch(() =>
                  setError(
                    'App-Update fehlgeschlagen. Bitte erneut versuchen.',
                  ),
                )
              }
            >
              App-Update installieren
            </Button>
          )}
        </div>
        {updateAvailable && (
          <p className="text-muted-foreground">
            Ein App-Update wartet. Bitte zuerst lokale Änderungen
            synchronisieren, dann das Update installieren.
          </p>
        )}
        <p className="text-muted-foreground">
          Deine Gruppen werden automatisch für die Offline-Nutzung gespeichert,
          sobald du die App mit Internet öffnest. Ausgaben erfassen, Salden und
          Statistiken funktionieren offline; Belege, KI und Gruppeneinstellungen
          brauchen Internet.
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            Technische Details
          </summary>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="inline font-medium">App-Dateien: </dt>
              <dd className="inline">
                {files.ready
                  ? `${files.pages} Seiten und ${files.assets} Dateien geprüft`
                  : files.missing?.length
                  ? `${files.missing.length} Seiten/Dateien fehlen`
                  : 'Noch nicht bestätigt'}
              </dd>
            </div>
            {files.version && (
              <div>
                <dt className="inline font-medium">Offline-Dienst: </dt>
                <dd className="inline">
                  {files.version}
                  {files.checkedAt
                    ? ` · geprüft ${new Date(
                        files.checkedAt,
                      ).toLocaleTimeString('de-DE')}`
                    : ''}
                </dd>
              </div>
            )}
            <div>
              Gilt nur für diese Installation auf diesem Gerät. Der Browser kann
              gespeicherte Daten bei Platzmangel entfernen.
            </div>
          </dl>
        </details>
      </CardContent>
    </Card>
  )
}

function ago(time: number) {
  const minutes = Math.round((Date.now() - time) / 60000)
  if (minutes < 1) return 'gerade eben'
  const format = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' })
  if (minutes < 60) return format.format(-minutes, 'minute')
  if (minutes < 24 * 60) return format.format(-Math.round(minutes / 60), 'hour')
  return new Date(time).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
