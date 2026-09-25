import { participantShareOf } from '@/lib/shares'
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
        id: true, // seeds who gets the leftover cent (see shares.ts)
        amount: true,
        expenseDate: true,
        isReimbursement: true,
        splitMode: true,
        paidFor: {
          select: {
            participant: { select: { id: true } },
            shares: true,
          },
        },
      },
      where: {
        groupId,
        isReimbursement: false,
      },
      orderBy: { expenseDate: 'asc' },
    })

    // Group by date, calculating participant share if filtered
    const dailyMap = new Map<string, number>()

    for (const exp of expenses) {
      const dateKey = exp.expenseDate.toISOString().slice(0, 10)
      let amount: number

      if (participantId) {
        // Calculate this participant's share (same logic as category stats)
        const share = participantShareOf(participantId, exp)
        if (share === null) continue
        // Same apportionment as the balances: whole minor units, no drift.
        amount = share
      } else {
        amount = exp.amount
      }

      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + amount)
    }

    const days = Array.from(dailyMap.entries())
      .map(([date, total]) => ({ date, total: Math.round(total) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return { days }
  })
