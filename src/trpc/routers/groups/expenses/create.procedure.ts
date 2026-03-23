import { createExpense, getGroup } from '@/lib/api'
import {
  getNotificationText,
  getNotificationTitle,
} from '@/lib/notification-i18n'
import {
  formatExpenseAmount,
  sendPushNotificationsToGroup,
} from '@/lib/push'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const createGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
      participantId: z.string().optional(),
    }),
  )
  .mutation(
    async ({ input: { groupId, expenseFormValues, participantId } }) => {
      const expense = await createExpense(
        expenseFormValues,
        groupId,
        participantId,
      )

      // Fire-and-forget push notification
      getGroup(groupId).then(async (group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        const amountStr = formatExpenseAmount(
          expenseFormValues.amount,
          group.currency,
        )
        const title = await getNotificationTitle('expense.created.title')
        const body = await getNotificationText('expense.created.body', {
          name: participantName,
          title: expenseFormValues.title,
          amount: amountStr,
        })
        sendPushNotificationsToGroup(
          groupId,
          participantId,
          { title, body, url: `/groups/${groupId}` },
          'create',
        ).catch(() => {})
      })

      return { expenseId: expense.id }
    },
  )
