import { prisma } from '@/lib/prisma'

export interface NotificationPayload {
  title: string
  body: string
  url?: string
}

export type NotificationEvent = 'create' | 'update' | 'delete'

export async function sendPushNotificationsToGroup(
  groupId: string,
  excludeParticipantId: string | undefined,
  payload: NotificationPayload,
  event: NotificationEvent = 'create',
) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:spliit@example.com'

  if (!publicKey || !privateKey) return

  try {
    // Dynamic import to avoid bundling Node.js-only web-push in client
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails(subject, publicKey, privateKey)

    // Filter by event preference
    const preferenceFilter =
      event === 'create'
        ? { notifyOnCreate: true }
        : event === 'update'
          ? { notifyOnUpdate: true }
          : { notifyOnDelete: true }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        participant: { groupId },
        ...(excludeParticipantId
          ? { participantId: { not: excludeParticipantId } }
          : {}),
        ...preferenceFilter,
      },
    })

    const payloadStr = JSON.stringify(payload)

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadStr,
          )
          .catch(async (err: { statusCode?: number }) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await prisma.pushSubscription
                .delete({ where: { id: sub.id } })
                .catch(() => {})
            }
            throw err
          }),
      ),
    )

    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.warn(
        `Push notifications: ${failed}/${results.length} failed for group ${groupId}`,
      )
    }
  } catch (err) {
    console.error('Error sending push notifications:', err)
  }
}

export function formatExpenseAmount(amount: number, currency: string): string {
  return `${currency}${(amount / 100).toFixed(2)}`
}
