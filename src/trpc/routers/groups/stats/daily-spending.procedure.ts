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
        const paidForEntry = exp.paidFor.find(
          (pf) => pf.participant.id === participantId,
        )
        if (!paidForEntry) continue

        const totalShares = exp.paidFor.reduce(
          (sum, pf) => sum + (pf.shares ?? 0),
          0,
        )

        if (exp.splitMode === 'EVENLY') {
          amount = exp.amount / exp.paidFor.length
        } else if (exp.splitMode === 'BY_SHARES' && totalShares > 0) {
          amount =
            (exp.amount * (paidForEntry.shares ?? 0)) / totalShares
        } else if (exp.splitMode === 'BY_AMOUNT') {
          amount = paidForEntry.shares ?? 0
        } else if (exp.splitMode === 'BY_PERCENTAGE' && totalShares > 0) {
          amount =
            (exp.amount * (paidForEntry.shares ?? 0)) / totalShares
        } else {
          amount = exp.amount / exp.paidFor.length
        }
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
