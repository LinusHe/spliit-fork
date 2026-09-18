'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { readData } from '@/lib/offline/storage'
import { useOfflineStatus } from '@/components/offline-status'

interface VersionInfo {
  version: number
  hash: string
  date: string
}

export function AppVersion() {
  const offline = useOfflineStatus()
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch('/version.json?' + Date.now())
      .then((r) => r.json() as Promise<VersionInfo>)
      .then((v) => setVersion(v))
      .catch(() => {})
  }, [])

  const forceUpdate = useCallback(async () => {
    if (!navigator.onLine || (await readData()).queue.length) return
    setUpdating(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      await registration?.update()
      if (registration?.waiting) {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
        registration.waiting.postMessage('SKIP_WAITING')
        return
      }
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }, [])

  if (!version) return null

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span>
        v{version.version}{' '}
        <span className="opacity-50">({version.hash.slice(0, 7)})</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={forceUpdate}
        disabled={updating || offline.offline || offline.pending > 0}
        className="h-6 px-2 text-xs"
      >
        <RefreshCw className={`w-3 h-3 mr-1 ${updating ? 'animate-spin' : ''}`} />
        {updating ? '...' : 'Update'}
      </Button>
    </div>
  )
}
