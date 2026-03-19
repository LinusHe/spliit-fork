'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface VersionInfo {
  version: number
  hash: string
  date: string
}

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState<VersionInfo | null>(null)
  const [newVersion, setNewVersion] = useState<VersionInfo | null>(null)

  // Fetch initial version on mount
  useEffect(() => {
    fetch('/version.json?' + Date.now())
      .then((r) => r.json() as Promise<VersionInfo>)
      .then((v) => setCurrentVersion(v))
      .catch(() => {})
  }, [])

  // Poll for updates every 60 seconds
  useEffect(() => {
    if (!currentVersion) return

    const check = async () => {
      try {
        const res = await fetch('/version.json?' + Date.now())
        const remote = await (res.json() as Promise<VersionInfo>)
        if (remote.version > currentVersion.version || remote.hash !== currentVersion.hash) {
          setNewVersion(remote)
          setUpdateAvailable(true)
        }
      } catch {}
    }

    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  }, [currentVersion])

  const applyUpdate = useCallback(async () => {
    // Tell SW to skip waiting, then the controllerchange listener reloads
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.waiting) {
      reg.waiting.postMessage('SKIP_WAITING')
    } else {
      // No waiting worker, just hard reload
      window.location.reload()
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md">
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 shadow-lg">
        <div className="text-sm">
          <span className="font-medium">Update verfügbar</span>
          {newVersion && (
            <span className="text-muted-foreground ml-1">
              (v{newVersion.version})
            </span>
          )}
        </div>
        <Button size="sm" onClick={applyUpdate} className="shrink-0">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Aktualisieren
        </Button>
      </div>
    </div>
  )
}
