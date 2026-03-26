import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getDailySpendingProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, participantId } }) => {
    const expenses = await prisma.expense.findMany({
      select: {
        amount: true,
        expenseDate: true,
        isReimbursement: true,
        paidBy: { select: { id: true } },
      },
      where: {
        groupId,
        isReimbursement: false,
        ...(participantId ? { paidById: participantId } : {}),
      },
      orderBy: { expenseDate: 'asc' },
    })

    // Group by date
    const dailyMap = new Map<string, number>()
    for (const exp of expenses) {
      const dateKey = exp.expenseDate.toISOString().slice(0, 10)
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + exp.amount)
    }

    const days = Array.from(dailyMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { days }
  })
