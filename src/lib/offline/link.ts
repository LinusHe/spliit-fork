import type { AppRouter } from '@/trpc/routers/_app'
import { TRPCClientError, type TRPCLink } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { enqueue, isOffline, offlineQuery } from './engine'

export const offlineLink: TRPCLink<AppRouter> =
  () =>
  ({ op, next }) =>
    observable((observer) => {
      let subscription: { unsubscribe: () => void } | undefined
      let cancelled = false
      void (async () => {
        if (typeof window !== 'undefined' && !op.path.startsWith('offline.')) {
          if (
            op.type === 'mutation' &&
            /^groups\.expenses\.(create|update|delete|settle)$/.test(op.path)
          ) {
            const data = await enqueue(
              op.path,
              op.input as Record<string, unknown>,
            )
            if (!cancelled) {
              observer.next({ result: { data } })
              observer.complete()
            }
            return
          }
          if (op.type === 'query') {
            const data = await offlineQuery(
              op.path,
              (op.input ?? {}) as Record<string, unknown>,
            )
            if (data !== undefined) {
              if (!cancelled) {
                observer.next({ result: { data } })
                observer.complete()
              }
              return
            }
          }
          if (isOffline())
            throw new Error(
              'Diese Funktion benötigt eine Internetverbindung. Deine lokalen Ausgaben bleiben gespeichert.',
            )
        }
        if (!cancelled) subscription = next(op).subscribe(observer)
      })().catch((error) => {
        if (!cancelled) observer.error(TRPCClientError.from(error))
      })
      return () => {
        cancelled = true
        subscription?.unsubscribe()
      }
    })
