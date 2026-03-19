'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface VersionInfo {
  version: number
  hash: string
  date: string
}

export function AppVersion() {
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetch('/version.json?' + Date.now())
      .then((r) => r.json() as Promise<VersionInfo>)
      .then((v) => setVersion(v))
      .catch(() => {})
  }, [])

  const forceUpdate = useCallback(async () => {
    setUpdating(true)
    try {
      // 1. Unregister all service workers
      const registrations = await navigator.serviceWorker?.getRegistrations()
      if (registrations) {
        await Promise.all(registrations.map((r) => r.unregister()))
      }

      // 2. Clear all caches
      const cacheNames = await caches?.keys()
      if (cacheNames) {
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }

      // 3. Re-register fresh SW and reload
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js')
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
        disabled={updating}
        className="h-6 px-2 text-xs"
      >
        <RefreshCw className={`w-3 h-3 mr-1 ${updating ? 'animate-spin' : ''}`} />
        {updating ? '...' : 'Update'}
      </Button>
    </div>
  )
}
