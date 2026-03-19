'use client'

import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/client'
import { BellIcon, BellRing } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationBell({
  groupId,
  participantId,
}: {
  groupId: string
  participantId: string | null
}) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  const subscribeMutation = trpc.notifications.subscribe.useMutation()
  const unsubscribeMutation = trpc.notifications.unsubscribe.useMutation()
  const { data: subscriptionStatus } =
    trpc.notifications.isSubscribed.useQuery(
      { participantId: participantId ?? '' },
      { enabled: !!participantId },
    )

  useEffect(() => {
    setIsSupported(
      'serviceWorker' in navigator &&
        'PushManager' in window &&
        !!vapidPublicKey,
    )
  }, [vapidPublicKey])

  useEffect(() => {
    if (subscriptionStatus) {
      setIsSubscribed(subscriptionStatus.subscribed)
    }
  }, [subscriptionStatus])

  const handleToggle = useCallback(async () => {
    if (!participantId || !vapidPublicKey) return

    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready

      if (isSubscribed) {
        // Unsubscribe
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await unsubscribeMutation.mutateAsync({
            participantId,
            endpoint: subscription.endpoint,
          })
          await subscription.unsubscribe()
        }
        setIsSubscribed(false)
      } else {
        // Subscribe
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          return
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })

        const json = subscription.toJSON()
        await subscribeMutation.mutateAsync({
          participantId,
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: json.keys?.p256dh ?? '',
              auth: json.keys?.auth ?? '',
            },
          },
        })
        setIsSubscribed(true)
      }
    } catch (err) {
      console.error('Notification toggle error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [
    participantId,
    vapidPublicKey,
    isSubscribed,
    subscribeMutation,
    unsubscribeMutation,
  ])

  if (!isSupported || !participantId) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={isLoading}
      title={isSubscribed ? 'Disable notifications' : 'Enable notifications'}
      aria-label={
        isSubscribed ? 'Disable notifications' : 'Enable notifications'
      }
    >
      {isSubscribed ? (
        <BellRing className="h-5 w-5" />
      ) : (
        <BellIcon className="h-5 w-5" />
      )}
    </Button>
  )
}
