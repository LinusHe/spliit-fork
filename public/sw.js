// Spliit Service Worker with Push Notifications + Auto-Update

const CACHE_VERSION = '__BUILD_VERSION__'
// One cache across deployments. /_next/static files are content-hashed, and a
// cached page keeps working with the bundles it references. A per-version
// cache started empty after every update: iOS activates a waiting worker on
// the next cold start, which then could not open anything offline.
const CACHE = 'spliit-offline'
const LEGACY_CACHE_PREFIX = 'spliit-offline-v1-'
const FALLBACK = '/offline.html'
// Start page of the installed app (manifest start_url) and the root alias.
const SHELL = ['/groups', '/']
// Give a slow network this long before a launch falls back to the saved page.
const NAVIGATION_TIMEOUT = 3500

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

// Carry pages and bundles over from the per-version caches of older workers.
async function migrateLegacyCaches() {
  const cache = await caches.open(CACHE)
  for (const name of await caches.keys()) {
    if (!name.startsWith(LEGACY_CACHE_PREFIX)) continue
    const legacy = await caches.open(name)
    for (const request of await legacy.keys()) {
      if (await cache.match(request)) continue
      const response = await legacy.match(request)
      if (response) await cache.put(request, response)
    }
  }
}

// Drop bundles that no saved page references any more (older deployments).
async function pruneAssets() {
  const cache = await caches.open(CACHE)
  const keys = await cache.keys()
  const referenced = new Set()
  for (const request of keys) {
    const response = await cache.match(request)
    if (!response?.headers.get('content-type')?.includes('text/html')) continue
    for (const url of documentAssets(await response.text())) referenced.add(url)
  }
  for (const request of keys) {
    const path = new URL(request.url).pathname
    if (path.startsWith('/_next/static/') && !referenced.has(path))
      await cache.delete(request)
  }
}

self.addEventListener('install', (event) => {
  // Updates wait for explicit activation. Never reload an open expense form.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll([FALLBACK, '/android-chrome-192x192.png'])
      await migrateLegacyCaches()
      // Best effort: the installed app can start offline even before a group
      // was opened. Failure must not block the worker installation.
      for (const path of SHELL) await cacheDocument(path).catch(() => {})
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await migrateLegacyCaches()
      for (const name of await caches.keys())
        if (name.startsWith(LEGACY_CACHE_PREFIX)) await caches.delete(name)
      await pruneAssets().catch(() => {})
      // Claim all clients so the new SW takes effect immediately
      await self.clients.claim()
    })(),
  )
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
        const network = fetch(request).then(async (response) => {
          if (
            response.ok &&
            response.headers.get('content-type')?.includes('text/html')
          )
            await cache.put(url.pathname, response.clone())
          if (response.status >= 500) throw new Error('Server error')
          return response
        })
        // Weak connections must not leave the installed app on a white screen:
        // after a short wait, open the saved page instead. Read the cache only
        // then; holding a cached copy while the same entry is being replaced
        // crashed WebKit's storage process.
        const first = await Promise.race([
          network.then(
            (response) => ({ response }),
            () => ({ failed: true }),
          ),
          new Promise((resolve) =>
            setTimeout(() => resolve({}), NAVIGATION_TIMEOUT),
          ),
        ])
        if (first.response) return first.response
        const cached = await cache.match(url.pathname)
        if (cached) return cached
        if (!first.failed) {
          try {
            return await network
          } catch {
            /* Offline, including cold starts. */
          }
        }
        return cache.match(FALLBACK)
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
