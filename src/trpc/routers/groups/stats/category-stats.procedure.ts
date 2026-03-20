import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getCategoryStatsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, participantId } }) => {
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        isReimbursement: false,
      },
      select: {
        amount: true,
        splitMode: true,
        category: {
          select: { id: true, grouping: true, name: true },
        },
        paidFor: {
          select: {
            participant: { select: { id: true } },
            shares: true,
          },
        },
      },
    })

    const categoryMap = new Map<
      number,
      { id: number; grouping: string; name: string; total: number; count: number }
    >()

    for (const expense of expenses) {
      const catId = expense.category?.id ?? 0
      let amount: number

      if (participantId) {
        // Calculate this participant's share of the expense
        const paidForEntry = expense.paidFor.find(
          (pf) => pf.participant.id === participantId,
        )
        if (!paidForEntry) continue // Not involved in this expense

        const totalShares = expense.paidFor.reduce((sum, pf) => sum + (pf.shares ?? 0), 0)

        if (expense.splitMode === 'EVENLY') {
          amount = (expense.amount / expense.paidFor.length) / 100
        } else if (expense.splitMode === 'BY_SHARES' && totalShares > 0) {
          amount = (expense.amount * (paidForEntry.shares ?? 0) / totalShares) / 100
        } else if (expense.splitMode === 'BY_AMOUNT') {
          amount = (paidForEntry.shares ?? 0) / 100
        } else if (expense.splitMode === 'BY_PERCENTAGE' && totalShares > 0) {
          amount = (expense.amount * (paidForEntry.shares ?? 0) / totalShares) / 100
        } else {
          amount = (expense.amount / expense.paidFor.length) / 100
        }
      } else {
        amount = expense.amount / 100
      }

      const existing = categoryMap.get(catId)
      if (existing) {
        existing.total += amount
        existing.count += 1
      } else {
        categoryMap.set(catId, {
          id: catId,
          grouping: expense.category?.grouping ?? 'Uncategorized',
          name: expense.category?.name ?? 'General',
          total: amount,
          count: 1,
        })
      }
    }

    const categories = Array.from(categoryMap.values()).sort(
      (a, b) => b.total - a.total,
    )

    const grandTotal = categories.reduce((sum, c) => sum + c.total, 0)

    return { categories, grandTotal }
  })
