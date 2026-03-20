'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useActiveUser } from '@/lib/hooks'
import { trpc } from '@/trpc/client'
import { Bell, BellOff, BellRing } from 'lucide-react'
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

export function NotificationSettings({ groupId }: { groupId: string }) {
  const t = useTranslations('Notifications')
  const participantId = useActiveUser(groupId)
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const [notifyOnCreate, setNotifyOnCreate] = useState(true)
  const [notifyOnUpdate, setNotifyOnUpdate] = useState(true)
  const [notifyOnDelete, setNotifyOnDelete] = useState(true)

  const subscribeMutation = trpc.notifications.subscribe.useMutation()
  const unsubscribeMutation = trpc.notifications.unsubscribe.useMutation()
  const updatePrefsMutation = trpc.notifications.updatePreferences.useMutation()

  const { data: prefs, refetch: refetchPrefs } =
    trpc.notifications.getPreferences.useQuery(
      { participantId: participantId ?? '' },
      { enabled: !!participantId },
    )

  useEffect(() => {
    setIsSupported(
      'serviceWorker' in navigator &&
        'PushManager' in window &&
        !!vapidPublicKey,
    )
    // Check if permission was already denied
    if ('Notification' in window && Notification.permission === 'denied') {
      setPermissionDenied(true)
    }
  }, [vapidPublicKey])

  useEffect(() => {
    if (prefs) {
      setIsSubscribed(prefs.subscribed)
      setNotifyOnCreate(prefs.notifyOnCreate)
      setNotifyOnUpdate(prefs.notifyOnUpdate)
      setNotifyOnDelete(prefs.notifyOnDelete)
    }
  }, [prefs])

  const handleToggleSubscription = useCallback(async () => {
    if (!participantId || !vapidPublicKey) return

    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready

      if (isSubscribed) {
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
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setPermissionDenied(true)
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
        await refetchPrefs()
      }
    } catch (err) {
      console.error('Notification toggle error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [participantId, vapidPublicKey, isSubscribed, subscribeMutation, unsubscribeMutation, refetchPrefs])

  const handlePreferenceChange = useCallback(
    async (key: 'notifyOnCreate' | 'notifyOnUpdate' | 'notifyOnDelete', value: boolean) => {
      if (!participantId) return

      const newPrefs = { notifyOnCreate, notifyOnUpdate, notifyOnDelete, [key]: value }

      // Optimistic update
      if (key === 'notifyOnCreate') setNotifyOnCreate(value)
      if (key === 'notifyOnUpdate') setNotifyOnUpdate(value)
      if (key === 'notifyOnDelete') setNotifyOnDelete(value)

      try {
        await updatePrefsMutation.mutateAsync({
          participantId,
          ...newPrefs,
        })
      } catch {
        // Revert on error
        if (key === 'notifyOnCreate') setNotifyOnCreate(!value)
        if (key === 'notifyOnUpdate') setNotifyOnUpdate(!value)
        if (key === 'notifyOnDelete') setNotifyOnDelete(!value)
      }
    },
    [participantId, notifyOnCreate, notifyOnUpdate, notifyOnDelete, updatePrefsMutation],
  )

  if (!isSupported) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="w-5 h-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('notSupported')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!participantId) {
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('noActiveUser')}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isSubscribed ? (
            <BellRing className="w-5 h-5 text-primary" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Subscribe/Unsubscribe */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {isSubscribed ? t('enabled') : t('disabled')}
            </p>
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggleSubscription}
              disabled={isLoading || (permissionDenied && !isSubscribed)}
            />
          </div>
          {permissionDenied && !isSubscribed && (
            <p className="text-xs text-destructive">
              {t('permissionDenied')}
            </p>
          )}
        </div>

        {/* Preferences (only shown when subscribed) */}
        {isSubscribed && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t('settings')}
            </p>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-create" className="text-sm cursor-pointer">
                {t('notifyOnCreate')}
              </Label>
              <Switch
                id="notify-create"
                checked={notifyOnCreate}
                onCheckedChange={(v) => handlePreferenceChange('notifyOnCreate', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-update" className="text-sm cursor-pointer">
                {t('notifyOnUpdate')}
              </Label>
              <Switch
                id="notify-update"
                checked={notifyOnUpdate}
                onCheckedChange={(v) => handlePreferenceChange('notifyOnUpdate', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="notify-delete" className="text-sm cursor-pointer">
                {t('notifyOnDelete')}
              </Label>
              <Switch
                id="notify-delete"
                checked={notifyOnDelete}
                onCheckedChange={(v) => handlePreferenceChange('notifyOnDelete', v)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
