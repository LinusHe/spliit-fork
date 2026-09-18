import superjson from 'superjson'
import type { OfflineData } from './types'

const EMPTY = (): OfflineData => ({ snapshots: {}, queue: [] })
let database: Promise<IDBDatabase> | undefined
let channel: BroadcastChannel | undefined
const listeners = new Set<() => void>()

function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('spliit-offline-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onerror = () => {
      database = undefined
      reject(
        new Error(
          'Lokaler Speicher nicht verfügbar. Änderung wurde nicht gespeichert.',
        ),
      )
    }
    request.onsuccess = () => resolve(request.result)
  }))
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
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly')
    const request = tx.objectStore('state').get('data')
    request.onsuccess = () => {
      try {
        resolve(request.result ? superjson.parse(request.result) : EMPTY())
      } catch {
        reject(new Error('Lokaler Speicher konnte nicht gelesen werden.'))
      }
    }
    request.onerror = () => reject(request.error)
  })
}

// One read/write transaction, not read-await-write: safe across tabs and crashes.
export async function changeData(change: (data: OfflineData) => void) {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite')
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
  })
  channel?.postMessage('changed')
  announce()
}
