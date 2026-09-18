// Spliit Service Worker with Push Notifications + Auto-Update

// Cache name includes version for cache busting
const CACHE_VERSION = '__BUILD_VERSION__'
const CACHE = `spliit-offline-v1-${CACHE_VERSION}`
const FALLBACK = '/offline.html'

function documentAssets(html) {
  return [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"<>]+)"/g)]
        .map((m) => m[1].replace(/&amp;/g, '&'))
        .filter(
          (url) =>
            url.startsWith('/') &&
            !url.startsWith('//') &&
            (url.startsWith('/_next/static/') ||
              /\.(woff2?|png|svg|ico)$/.test(url)),
        )
        .concat(['/logo-with-text.png', '/android-chrome-192x192.png']),
    ),
  ]
}

async function checkDocuments(paths) {
  const cache = await caches.open(CACHE)
  const missing = []
  const assets = new Set()
  for (const path of paths) {
    const response = await cache.match(path)
    if (
      !response ||
      !response.ok ||
      !response.headers.get('content-type')?.includes('text/html')
    ) {
      missing.push(path)
      continue
    }
    for (const url of documentAssets(await response.text())) assets.add(url)
  }
  for (const url of assets) if (!(await cache.match(url))) missing.push(url)
  return {
    protocol: 2,
    version: CACHE_VERSION,
    ready: missing.length === 0,
    missing,
    pages: paths.length,
    assets: assets.size,
  }
}

async function cacheDocument(path) {
  const response = await fetch(path, {
    headers: { 'X-Spliit-Offline-Warm': '1' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('text/html')
  )
    throw new Error('Page unavailable')
  const cache = await caches.open(CACHE)
  const html = await response.clone().text()
  // Cache route bundles too: merely saving HTML is not enough for a cold start.
  const assets = documentAssets(html)
  await Promise.all(
    assets.map(async (url) => {
      if (await cache.match(url)) return
      const asset = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!asset.ok) throw new Error('Asset unavailable')
      await cache.put(url, asset)
    }),
  )
  // A fetched redirect response can be rejected during offline navigation by
  // WebKit. Store a plain HTML response at each launch alias instead.
  await cache.put(
    path,
    new Response(html, { status: 200, headers: response.headers }),
  )
}

self.addEventListener('install', (event) => {
  // Updates wait for explicit activation. Never reload an open expense form.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([FALLBACK, '/android-chrome-192x192.png'])),
  )
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
  if (['WARM_URLS', 'CHECK_OFFLINE'].includes(event.data?.type)) {
    const paths = (Array.isArray(event.data.paths) ? event.data.paths : [])
      .filter(
        (path) =>
          typeof path === 'string' &&
          (path === '/' || /^\/groups(?:\/[A-Za-z0-9_-]+)*$/.test(path)),
      )
      .slice(0, 12)
    event.waitUntil(
      (async () => {
        const failed = []
        if (event.data.type === 'WARM_URLS') {
          for (const path of paths) {
            try {
              await cacheDocument(path)
            } catch {
              failed.push(path)
            }
          }
        }
        try {
          event.ports[0]?.postMessage({
            done: true,
            failed,
            ...(await checkDocuments(paths)),
          })
        } catch {
          event.ports[0]?.postMessage({
            done: true,
            protocol: 2,
            ready: false,
            failed: paths,
            missing: paths,
            error: 'Cache nicht lesbar',
          })
        }
      })(),
    )
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json' ||
    url.pathname === '/sw.js'
  )
    return
  if (request.headers.has('RSC') || url.searchParams.has('_rsc')) return
  const asset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  if (asset) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      })(),
    )
  } else if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const response = await fetch(request)
          if (
            response.ok &&
            response.headers.get('content-type')?.includes('text/html')
          )
            await cache.put(url.pathname, response.clone())
          if (response.status < 500) return response
        } catch {
          /* Offline, including cold starts. */
        }
        return (
          (await cache.match(url.pathname)) || (await cache.match(FALLBACK))
        )
      })(),
    )
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

  event.waitUntil(
    self.registration.showNotification(data.title || 'Spliit', options),
  )
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
