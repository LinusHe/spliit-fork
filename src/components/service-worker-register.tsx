'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      const ready = () => window.dispatchEvent(new Event('spliit-update-ready'))
      if (registration.waiting) ready()
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) ready()
        })
      })
    }).catch((err) => {
      console.warn('Service worker registration failed:', err)
    })

    // First install/activation must not reload an open form. UpdateBanner owns
    // explicit updates and checks the durable outbox before activation.
  }, [])

  return null
}
