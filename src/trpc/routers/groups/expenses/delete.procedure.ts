import { deleteExpense, getExpense, getGroup } from '@/lib/api'
import { sendPushNotificationsToGroup } from '@/lib/push'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      participantId: z.string().optional(),
    }),
  )
  .mutation(async ({ input: { expenseId, groupId, participantId } }) => {
    const existingExpense = await getExpense(groupId, expenseId)
    await deleteExpense(groupId, expenseId, participantId)

    // Fire-and-forget push notification
    if (existingExpense) {
      getGroup(groupId).then((group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        sendPushNotificationsToGroup(groupId, participantId, {
          title: 'Expense Deleted',
          body: `${participantName} deleted: ${existingExpense.title}`,
          url: `/groups/${groupId}`,
        }).catch(() => {})
      })
    }

    return {}
  })
