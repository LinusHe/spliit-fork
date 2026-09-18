import superjson from 'superjson'
import type { OfflineData } from './types'

const EMPTY = (): OfflineData => ({ snapshots: {}, queue: [] })
let database: Promise<IDBDatabase> | undefined
let channel: BroadcastChannel | undefined
const listeners = new Set<() => void>()

function open() {
  if (database) return database
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('spliit-offline-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onerror = () => {
      if (database === opening) database = undefined
      reject(
        new Error(
          'Lokaler Speicher nicht verfügbar. Änderung wurde nicht gespeichert.',
        ),
      )
    }
    request.onsuccess = () => {
      const db = request.result
      const forget = () => {
        if (database === opening) database = undefined
      }
      db.onclose = forget
      db.onversionchange = () => {
        forget()
        db.close()
      }
      resolve(db)
    }
  })
  database = opening
  return opening
}

async function withTransaction<T>(
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const opening = open()
    const db = await opening
    let tx: IDBTransaction
    try {
      tx = db.transaction('state', mode)
    } catch (error) {
      // Safari may close an idle connection before emitting its close event.
      // Retry only transaction creation: no request/write has run yet.
      if (
        !(error instanceof DOMException) ||
        error.name !== 'InvalidStateError' ||
        attempt > 0
      )
        throw error
      if (database === opening) database = undefined
      db.close()
      continue
    }
    // Queue requests synchronously in this task; don't yield an empty
    // transaction across an await (WebKit may auto-commit it).
    return action(tx)
  }
}

function announce() {
  listeners.forEach((listener) => listener())
}

export function subscribeData(listener: () => void) {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('spliit-offline')
    channel.onmessage = announce
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function readData(): Promise<OfflineData> {
  return withTransaction(
    'readonly',
    (tx) =>
      new Promise((resolve, reject) => {
        const request = tx.objectStore('state').get('data')
        request.onsuccess = () => {
          try {
            resolve(request.result ? superjson.parse(request.result) : EMPTY())
          } catch {
            reject(new Error('Lokaler Speicher konnte nicht gelesen werden.'))
          }
        }
        request.onerror = () => reject(request.error)
      }),
  )
}

// One read/write transaction, not read-await-write: safe across tabs and crashes.
export async function changeData(change: (data: OfflineData) => void) {
  await withTransaction(
    'readwrite',
    (tx) =>
      new Promise<void>((resolve, reject) => {
        const store = tx.objectStore('state')
        const request = store.get('data')
        request.onsuccess = () => {
          try {
            const data = request.result
              ? superjson.parse<OfflineData>(request.result)
              : EMPTY()
            change(data)
            store.put(superjson.stringify(data), 'data')
          } catch {
            tx.abort()
          }
        }
        tx.oncomplete = () => resolve()
        tx.onabort = tx.onerror = () =>
          reject(
            new Error(
              'Lokales Speichern fehlgeschlagen. Bitte die Eingabe nicht schließen und Speicherplatz prüfen.',
            ),
          )
      }),
  )
  channel?.postMessage('changed')
  announce()
}
