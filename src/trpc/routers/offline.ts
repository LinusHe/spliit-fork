import {
  createExpense,
  deleteExpense,
  getExpense,
  getGroup,
  settleExpenseShares,
  updateExpense,
} from '@/lib/api'
import {
  currencyIdentity,
  mutationSchema,
  type Snapshot,
  type SyncResult,
} from '@/lib/offline/types'
import { prisma } from '@/lib/prisma'
import { sendPushNotificationsToGroup } from '@/lib/push'
import { baseProcedure, createTRPCRouter } from '@/trpc/init'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { createHash } from 'node:crypto'
import superjson from 'superjson'
import { z } from 'zod'

export const offlineRouter = createTRPCRouter({
  snapshot: baseProcedure
    .input(z.object({ groupId: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      return prisma.$transaction(
        async (tx): Promise<Snapshot> => {
          const group = await getGroup(input.groupId, tx)
          if (!group)
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Gruppe nicht mehr vorhanden.',
            })
          const expenses = await tx.expense.findMany({
            where: { groupId: input.groupId },
            include: {
              paidBy: true,
              paidFor: true,
              category: true,
              documents: true,
              recurringExpenseLink: true,
            },
            orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
          })
          const categories = await tx.category.findMany()
          const activities = (
            await tx.activity.findMany({
              where: { groupId: input.groupId },
              orderBy: { time: 'desc' },
              take: 500,
            })
          ).map((a) => ({
            ...a,
            expense: expenses.find((e) => e.id === a.expenseId),
          }))
          return {
            group,
            expenses,
            categories,
            activities,
            savedAt: Date.now(),
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      )
    }),
  commit: baseProcedure
    .input(mutationSchema)
    .mutation(async ({ input }): Promise<SyncResult> => {
      const requestHash = createHash('sha256')
        .update(superjson.stringify(input))
        .digest('hex')
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const result = await prisma.$transaction(
            async (tx) => {
              const receipt = await tx.offlineMutation.findUnique({
                where: { id: input.id },
              })
              if (receipt) {
                if (
                  receipt.groupId !== input.groupId ||
                  receipt.requestHash !== requestHash
                ) {
                  throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message:
                      'Änderungs-ID wurde bereits anderweitig verwendet.',
                  })
                }
                return { status: 'applied' as const, fresh: false }
              }
              const group = await getGroup(input.groupId, tx)
              if (!group)
                throw new TRPCError({
                  code: 'NOT_FOUND',
                  message:
                    'Gruppe wurde online gelöscht. Lokale Änderungen bleiben gespeichert.',
                })
              if (currencyIdentity(group) !== input.groupCurrency)
                throw new TRPCError({
                  code: 'PRECONDITION_FAILED',
                  message:
                    'Die Gruppenwährung wurde geändert. Lokale Änderungen bleiben gespeichert; bitte zuerst prüfen.',
                })
              const current = await getExpense(
                input.groupId,
                input.expenseId,
                tx,
              )
              if (input.kind === 'settle') {
                // Marking a share as paid does not conflict with edits made
                // online meanwhile: it only touches settledAt, which updates
                // preserve. An expense deleted online makes it a no-op.
                if (current && input.settle)
                  await settleExpenseShares(
                    input.groupId,
                    input.expenseId,
                    input.settle.participantIds,
                    input.settle.settled,
                    input.participantId,
                    tx,
                    // Only continue the local version chain if nobody changed
                    // the expense online; otherwise later queued edits must
                    // still see the conflict.
                    current.syncVersion === input.baseVersion
                      ? input.id
                      : undefined,
                  )
                await tx.offlineMutation.create({
                  data: { id: input.id, groupId: input.groupId, requestHash },
                })
                return { status: 'applied' as const, fresh: !!current }
              }
              if ((current?.syncVersion ?? null) !== input.baseVersion) {
                return { status: 'conflict' as const, current }
              }
              if (input.kind !== 'delete') {
                if (!input.values)
                  throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Ausgabendaten fehlen.',
                  })
                const participantIds = [
                  input.values.paidBy,
                  ...input.values.paidFor.map((p) => p.participant),
                ]
                if (
                  participantIds.some(
                    (id) => !group.participants.some((p) => p.id === id),
                  )
                ) {
                  throw new TRPCError({
                    code: 'PRECONDITION_FAILED',
                    message:
                      'Eine beteiligte Person wurde online entfernt. Lokale Änderung bleibt gespeichert.',
                  })
                }
                if (current) {
                  await updateExpense(
                    input.groupId,
                    input.expenseId,
                    input.values,
                    input.participantId,
                    tx,
                    input.id,
                  )
                } else {
                  // Includes explicitly approved restoration of an online-deleted expense.
                  await createExpense(
                    input.values,
                    input.groupId,
                    input.participantId,
                    tx,
                    input.expenseId,
                    input.id,
                  )
                }
              } else if (current) {
                await deleteExpense(
                  input.groupId,
                  input.expenseId,
                  input.participantId,
                  tx,
                )
              }
              await tx.offlineMutation.create({
                data: { id: input.id, groupId: input.groupId, requestHash },
              })
              return { status: 'applied' as const, fresh: true }
            },
            {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              timeout: 15000,
            },
          )
          if (result.status === 'applied' && result.fresh) {
            void sendPushNotificationsToGroup(
              input.groupId,
              input.participantId,
              {
                title: 'Spliit',
                body:
                  input.kind === 'delete'
                    ? 'Eine Ausgabe wurde gelöscht.'
                    : input.kind === 'settle'
                    ? input.settle?.settled
                      ? 'Eine Rückzahlung wurde als erledigt markiert.'
                      : 'Eine Rückzahlung wurde wieder als offen markiert.'
                    : `Ausgabe gespeichert: ${input.values?.title ?? ''}`,
                url: `/groups/${input.groupId}`,
              },
              input.kind === 'settle' ? 'update' : input.kind,
            ).catch(() => {})
          }
          return result.status === 'conflict' ? result : { status: 'applied' }
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2034', 'P2002'].includes(error.code) &&
            attempt < 3
          )
            continue
          throw error
        }
      }
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Gleichzeitige Änderung; bitte erneut synchronisieren.',
      })
    }),
})
