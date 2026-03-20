'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useActiveUser } from '@/lib/hooks'
import { trpc } from '@/trpc/client'
import { Bell } from 'lucide-react'
import { useTranslations } from 'next-intl'
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

const VISIT_COUNT_KEY = 'spliit-visit-count'
const PROMPT_DISMISSED_KEY = 'spliit-notification-prompt-dismissed'

export function NotificationPrompt({ groupId }: { groupId: string }) {
  const t = useTranslations('NotificationPrompt')
  const [showDialog, setShowDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const participantId = useActiveUser(groupId)
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  const subscribeMutation = trpc.notifications.subscribe.useMutation()
  const { data: subStatus } = trpc.notifications.isSubscribed.useQuery(
    { participantId: participantId ?? '' },
    { enabled: !!participantId },
  )

  useEffect(() => {
    // Don't show if not supported, no participant, no VAPID key, or already subscribed
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !vapidPublicKey ||
      !participantId
    )
      return

    // Already dismissed?
    if (localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true') return

    // Already subscribed?
    if (subStatus?.subscribed) return

    // Count visits
    const count = Number(localStorage.getItem(VISIT_COUNT_KEY) || '0') + 1
    localStorage.setItem(VISIT_COUNT_KEY, String(count))

    // Show on 3rd visit
    if (count >= 3) {
      // Small delay so page renders first
      const timer = setTimeout(() => setShowDialog(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [vapidPublicKey, participantId, subStatus])

  const handleEnable = useCallback(async () => {
    if (!participantId || !vapidPublicKey) return

    setIsLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        // Permission denied — don't ask again
        localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
        setShowDialog(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
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

      localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
      setShowDialog(false)
    } catch {
      localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
      setShowDialog(false)
    } finally {
      setIsLoading(false)
    }
  }, [participantId, vapidPublicKey, subscribeMutation])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
    setShowDialog(false)
  }, [])

  return (
    <Dialog open={showDialog} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{t('title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t('pwaHint')}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleEnable} disabled={isLoading} className="w-full">
            <Bell className="w-4 h-4 mr-2" />
            {t('enable')}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full"
          >
            {t('dismiss')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
