import { createExpense, getGroup } from '@/lib/api'
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
      getGroup(groupId).then((group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        const amountStr = formatExpenseAmount(
          expenseFormValues.amount,
          group.currency,
        )
        sendPushNotificationsToGroup(groupId, participantId, {
          title: 'New Expense',
          body: `${participantName} added: ${expenseFormValues.title} (${amountStr})`,
          url: `/groups/${groupId}`,
        }, 'create').catch(() => {})
      })

      return { expenseId: expense.id }
    },
  )
