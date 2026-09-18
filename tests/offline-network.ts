import { test as base, type BrowserContext } from '@playwright/test'
import { createServer, request as forward } from 'node:http'
import type { AddressInfo } from 'node:net'

// Real socket failures exercise the service worker on WebKit too. Playwright's
// WebKit context.setOffline aborts navigations before the worker can respond.
type TestNetwork = {
  url: string
  setOffline: (context: BrowserContext, offline: boolean) => Promise<void>
  dropNextCommit: () => void
  wasDropped: () => boolean
}

export const test = base.extend<{ network: TestNetwork }>({
  network: async ({}, use) => {
    let offline = false
    let dropNext = false
    let dropped = false
    const server = createServer((req, res) => {
      if (offline) {
        req.socket.destroy()
        return
      }
      const upstream = forward(
        `http://127.0.0.1:3133${req.url}`,
        { method: req.method, headers: req.headers },
        (reply) => {
          if (dropNext && req.url?.includes('/api/trpc/offline.commit')) {
            dropNext = false
            dropped = true
            reply.resume()
            res.destroy()
            return
          }
          res.writeHead(reply.statusCode ?? 502, reply.headers)
          reply.pipe(res)
        },
      )
      upstream.on('error', () => res.destroy())
      req.pipe(upstream)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    await use({
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      setOffline: async (context, value) => {
        offline = value
        for (const page of context.pages())
          await page.evaluate((offline) => {
            localStorage.setItem('__spliit-test-offline', String(offline))
            window.dispatchEvent(new Event(offline ? 'offline' : 'online'))
          }, value)
      },
      dropNextCommit: () => {
        dropNext = true
      },
      wasDropped: () => dropped,
    })
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  },
  baseURL: async ({ network }, use) => use(network.url),
})
