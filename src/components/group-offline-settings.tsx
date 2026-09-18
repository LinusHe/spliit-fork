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
      await checkOfflineReadiness(groupId, true)
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
  return (
    <Card data-testid="group-offline-settings">
      <CardHeader>
        <CardTitle className="text-xl">Offline-Verfügbarkeit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p
          role="status"
          data-testid="group-offline-ready"
          className={
            ready
              ? 'text-green-700 dark:text-green-400'
              : 'text-muted-foreground'
          }
        >
          {busy || files.preparing
            ? 'Offline-Dateien werden gespeichert …'
            : files.checking
            ? 'Offline-Verfügbarkeit wird geprüft …'
            : ready
            ? 'Auf diesem Gerät offline bereit'
            : 'Noch nicht vollständig offline verfügbar'}
        </p>
        <dl className="space-y-1">
          <div>
            <dt className="inline font-medium">Gruppendaten: </dt>
            <dd className="inline">
              {data
                ? `${data.expenses} Ausgaben gespeichert · ${new Date(
                    data.savedAt,
                  ).toLocaleString('de-DE')}`
                : 'Noch nicht auf diesem Gerät gespeichert'}
            </dd>
          </div>
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
          <div>
            <dt className="inline font-medium">Abgleich: </dt>
            <dd className="inline">
              {data?.pending
                ? `${data.pending} lokale Änderungen warten auf Übertragung`
                : 'Keine ausstehenden Änderungen in dieser Gruppe'}
            </dd>
          </div>
        </dl>
        {(error || files.error) && (
          <p role="alert" className="text-destructive">
            {error || files.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || files.checking}
            onClick={() => void checkOfflineReadiness(groupId)}
          >
            Offline-Stand prüfen
          </Button>
          <Button
            size="sm"
            disabled={sync.offline || busy || files.checking}
            onClick={() => void prepare()}
          >
            Offline-Dateien laden
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
          <p>
            Ein App-Update wartet. Bitte zuerst lokale Änderungen
            synchronisieren, dann das Update installieren und die Dateien erneut
            laden.
          </p>
        )}
        <p className="text-muted-foreground">
          Gilt nur für diese Installation auf diesem Gerät. Ausgaben, Salden und
          Statistiken funktionieren offline. Belegbilder/Uploads, KI und
          Änderungen an Gruppeneinstellungen benötigen Internet. Der Browser
          kann gespeicherte Daten bei Platzmangel entfernen.
        </p>
        {files.version && (
          <p className="text-xs text-muted-foreground">
            Offline-Dienst: {files.version}
            {files.checkedAt
              ? ` · geprüft ${new Date(files.checkedAt).toLocaleTimeString(
                  'de-DE',
                )}`
              : ''}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
