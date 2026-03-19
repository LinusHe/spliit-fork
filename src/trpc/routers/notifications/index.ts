import { prisma } from '@/lib/prisma'
import { baseProcedure, createTRPCRouter } from '@/trpc/init'
import { z } from 'zod'

export const notificationsRouter = createTRPCRouter({
  subscribe: baseProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
        subscription: z.object({
          endpoint: z.string().url(),
          keys: z.object({
            p256dh: z.string().min(1),
            auth: z.string().min(1),
          }),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const { participantId, subscription } = input

      await prisma.pushSubscription.upsert({
        where: {
          participantId_endpoint: {
            participantId,
            endpoint: subscription.endpoint,
          },
        },
        create: {
          participantId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        update: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      })

      return { success: true }
    }),

  unsubscribe: baseProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
        endpoint: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      const { participantId, endpoint } = input

      await prisma.pushSubscription
        .delete({
          where: {
            participantId_endpoint: { participantId, endpoint },
          },
        })
        .catch(() => {
          // Subscription may already be deleted
        })

      return { success: true }
    }),

  isSubscribed: baseProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const count = await prisma.pushSubscription.count({
        where: { participantId: input.participantId },
      })
      return { subscribed: count > 0 }
    }),
})
