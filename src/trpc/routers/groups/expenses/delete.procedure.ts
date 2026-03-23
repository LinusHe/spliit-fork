import { deleteExpense, getExpense, getGroup } from '@/lib/api'
import {
  getNotificationText,
  getNotificationTitle,
} from '@/lib/notification-i18n'
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
      getGroup(groupId).then(async (group) => {
        if (!group) return
        const participantName =
          group.participants.find((p) => p.id === participantId)?.name ??
          'Someone'
        const title = await getNotificationTitle('expense.deleted.title')
        const body = await getNotificationText('expense.deleted.body', {
          name: participantName,
          title: existingExpense.title,
        })
        sendPushNotificationsToGroup(
          groupId,
          participantId,
          { title, body, url: `/groups/${groupId}` },
          'delete',
        ).catch(() => {})
      })
    }

    return {}
  })
