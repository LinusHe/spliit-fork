'use client'

export type OfflineReadiness = {
  checking: boolean
  preparing: boolean
  ready: boolean
  version?: string
  pages?: number
  assets?: number
  missing?: string[]
  checkedAt?: number
  error?: string
}
const EMPTY: OfflineReadiness = {
  checking: false,
  preparing: false,
  ready: false,
}
let states: Record<string, OfflineReadiness> = {}
const listeners = new Set<() => void>()
const jobs = new Map<string, { job: Promise<void>; prepare: boolean }>()
const warmed = new Set<string>()
export const getReadiness = (id: string) => states[id] ?? EMPTY
export const getServerReadiness = () => EMPTY
export const subscribeReadiness = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
function update(id: string, value: Partial<OfflineReadiness>) {
  states = { ...states, [id]: { ...getReadiness(id), ...value } }
  listeners.forEach((fn) => fn())
}
export const offlinePaths = (id: string) => [
  '/',
  '/groups',
  `/groups/${id}`,
  ...['expenses', 'balances', 'stats', 'activity', 'edit', 'information'].map(
    (path) => `/groups/${id}/${path}`,
  ),
]

async function controller(): Promise<ServiceWorker> {
  if (!('serviceWorker' in navigator))
    throw new Error(
      'Offline-Start benötigt HTTPS und einen Browser mit Service Worker.',
    )
  if (navigator.serviceWorker.controller)
    return navigator.serviceWorker.controller
  return new Promise((resolve, reject) => {
    const changed = () => {
      if (!navigator.serviceWorker.controller) return
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
      resolve(navigator.serviceWorker.controller)
    }
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', changed)
      reject(
        new Error(
          'Offline-Dienst noch nicht aktiv. Bitte online die App aktualisieren.',
        ),
      )
    }, 10000)
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    changed()
  })
}

async function request(
  worker: ServiceWorker,
  id: string,
  prepare: boolean,
): Promise<OfflineReadiness> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(
      () => {
        channel.port1.close()
        reject(
          new Error(
            'Offline-Dienst antwortet nicht. Bitte online das App-Update installieren und erneut prüfen.',
          ),
        )
      },
      prepare ? 180000 : 5000,
    )
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer)
      channel.port1.close()
      if (data.protocol !== 2)
        reject(
          new Error(
            'Ein älterer Offline-Dienst ist aktiv. Bitte das App-Update installieren.',
          ),
        )
      else
        resolve({
          ...data,
          ready: data.ready && !data.failed?.length,
          checking: false,
          preparing: false,
          checkedAt: Date.now(),
        })
    }
    worker.postMessage(
      {
        type: prepare ? 'WARM_URLS' : 'CHECK_OFFLINE',
        paths: offlinePaths(id),
      },
      [channel.port2],
    )
  })
}

export async function checkOfflineReadiness(
  id: string,
  prepare = false,
  // Re-download even when the cache is complete (explicit user action).
  force = false,
) {
  const running = jobs.get(id)
  if (running) {
    if (prepare && !running.prepare) {
      await running.job
      return checkOfflineReadiness(id, true, force)
    }
    return running.job
  }
  const job = (async () => {
    update(id, { checking: true, preparing: false, error: undefined })
    try {
      const worker = await controller()
      // Probe the actual controlling worker before preparing. An old worker
      // must never be mistaken for the newly installed, waiting worker.
      let result = await request(worker, id, false)
      if (prepare && (force || !result.ready) && navigator.onLine) {
        update(id, { preparing: true })
        result = await request(worker, id, true)
      }
      if (navigator.serviceWorker.controller !== worker)
        throw new Error(
          'App-Version wurde gewechselt. Bitte Offline-Dateien erneut prüfen.',
        )
      update(id, result)
      if (result.ready) warmed.add(id)
      else warmed.delete(id)
    } catch (error) {
      warmed.delete(id)
      update(id, {
        checking: false,
        preparing: false,
        ready: false,
        error:
          error instanceof Error
            ? error.message
            : 'Offline-Prüfung fehlgeschlagen.',
      })
    }
  })().finally(() => jobs.delete(id))
  jobs.set(id, { job, prepare })
  return job
}

export async function warmPages(id: string) {
  if (!navigator.onLine || warmed.has(id)) return
  return checkOfflineReadiness(id, true)
}

export function resetOfflineReadiness() {
  warmed.clear()
  states = {}
  listeners.forEach((fn) => fn())
}
