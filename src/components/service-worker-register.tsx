'use client'

import { resetOfflineReadiness, warmPages } from '@/lib/offline/readiness'
import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const changed = () => {
      resetOfflineReadiness()
      const id = location.pathname.match(/^\/groups\/([^/]+)/)?.[1]
      if (id && id !== 'create') void warmPages(id)
    }
    navigator.serviceWorker.addEventListener('controllerchange', changed)

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const ready = () =>
          window.dispatchEvent(new Event('spliit-update-ready'))
        if (registration.waiting) ready()
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          worker?.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            )
              ready()
          })
        })
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })

    // First install/activation must not reload an open form. UpdateBanner owns
    // explicit updates and checks the durable outbox before activation.
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
  }, [])

  return null
}
