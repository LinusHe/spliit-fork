import { getGroup, updateExpense } from '@/lib/api'
import {
  getNotificationText,
  getNotificationTitle,
} from '@/lib/notification-i18n'
import { sendPushNotificationsToGroup } from '@/lib/push'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const updateGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      baseVersion: z.string().optional(),
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
      participantId: z.string().optional(),
    }),
  )
  .mutation(
    async ({
      input: { expenseId, groupId, expenseFormValues, participantId },
    }) => {
      const expense = await updateExpense(
        groupId,
        expenseId,
        expenseFormValues,
        participantId,
      )

      // Fire-and-forget push notification
      getGroup(groupId).then(async (group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        const title = await getNotificationTitle('expense.updated.title')
        const body = await getNotificationText('expense.updated.body', {
          name: participantName,
          title: expenseFormValues.title,
        })
        sendPushNotificationsToGroup(
          groupId,
          participantId,
          { title, body, url: `/groups/${groupId}` },
          'update',
        ).catch(() => {})
      })

      return { expenseId: expense.id }
    },
  )
