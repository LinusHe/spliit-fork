import { getGroup, updateExpense } from '@/lib/api'
import { sendPushNotificationsToGroup } from '@/lib/push'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const updateGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
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
      getGroup(groupId).then((group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        sendPushNotificationsToGroup(groupId, participantId, {
          title: 'Expense Updated',
          body: `${participantName} updated: ${expenseFormValues.title}`,
          url: `/groups/${groupId}`,
        }).catch(() => {})
      })

      return { expenseId: expense.id }
    },
  )
