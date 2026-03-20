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

  getPreferences: baseProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const subs = await prisma.pushSubscription.findMany({
        where: { participantId: input.participantId },
        select: {
          notifyOnCreate: true,
          notifyOnUpdate: true,
          notifyOnDelete: true,
        },
      })
      // Return preferences from first subscription (all subs share same prefs)
      if (subs.length === 0) {
        return { subscribed: false, notifyOnCreate: true, notifyOnUpdate: true, notifyOnDelete: true }
      }
      return {
        subscribed: true,
        notifyOnCreate: subs[0].notifyOnCreate,
        notifyOnUpdate: subs[0].notifyOnUpdate,
        notifyOnDelete: subs[0].notifyOnDelete,
      }
    }),

  updatePreferences: baseProcedure
    .input(
      z.object({
        participantId: z.string().min(1),
        notifyOnCreate: z.boolean(),
        notifyOnUpdate: z.boolean(),
        notifyOnDelete: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const { participantId, notifyOnCreate, notifyOnUpdate, notifyOnDelete } = input
      await prisma.pushSubscription.updateMany({
        where: { participantId },
        data: { notifyOnCreate, notifyOnUpdate, notifyOnDelete },
      })
      return { success: true }
    }),
})
