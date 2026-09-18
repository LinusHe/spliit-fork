// Spliit Service Worker with Push Notifications + Auto-Update

// Cache name includes version for cache busting
const CACHE_VERSION = '__BUILD_VERSION__'
const CACHE = `spliit-offline-v1-${CACHE_VERSION}`
const FALLBACK = '/offline.html'

async function cacheDocument(path) {
  const response = await fetch(path, { headers: { 'X-Spliit-Offline-Warm': '1' }, cache: 'no-store' })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return
  const cache = await caches.open(CACHE)
  const html = await response.clone().text()
  // Cache route bundles too: merely saving HTML is not enough for a cold start.
  const assets = [...html.matchAll(/(?:src|href)="([^"<>]+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'))
    .filter((url) => url.startsWith('/') && !url.startsWith('//') && (url.startsWith('/_next/static/') || /\.(woff2?|png|svg|ico)$/.test(url)))
  await Promise.all([...new Set(assets)].map(async (url) => {
    const asset = await fetch(url)
    if (!asset.ok) throw new Error('Asset unavailable')
    await cache.put(url, asset)
  }))
  await cache.put(path, response)
}

self.addEventListener('install', (event) => {
  // Updates wait for explicit activation. Never reload an open expense form.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([FALLBACK, '/android-chrome-192x192.png'])))
})

self.addEventListener('activate', (event) => {
  // Claim all clients so the new SW takes effect immediately
  event.waitUntil(self.clients.claim())
})

// Listen for skip-waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'WARM_URLS') {
    const paths = event.data.paths.filter((path) => typeof path === 'string' && /^\/groups(?:\/[A-Za-z0-9_-]+)*(?:\?.*)?$/.test(path)).slice(0, 12)
    event.waitUntil((async () => {
      const failed = []
      for (const path of paths) {
        try { await cacheDocument(path) } catch { failed.push(path) }
      }
      event.ports[0]?.postMessage({ done: true, failed })
    })())
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/version.json' || url.pathname === '/sw.js') return
  if (request.headers.has('RSC') || url.searchParams.has('_rsc')) return
  const asset = url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  if (asset) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
  } else if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) await cache.put(url.pathname, response.clone())
        if (response.status < 500) return response
      } catch { /* Offline, including cold starts. */ }
      return await cache.match(url.pathname) || await cache.match(FALLBACK)
    })())
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Spliit', body: event.data.text() }
  }

  const options = {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    data: { url: data.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(data.title || 'Spliit', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus()
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      }),
  )
})
