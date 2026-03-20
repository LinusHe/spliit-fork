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
        ...(participantId ? { paidById: participantId } : {}),
      },
      select: {
        amount: true,
        category: {
          select: { id: true, grouping: true, name: true },
        },
      },
    })

    // Aggregate by category
    const categoryMap = new Map<
      number,
      { id: number; grouping: string; name: string; total: number; count: number }
    >()

    for (const expense of expenses) {
      const catId = expense.category?.id ?? 0
      const existing = categoryMap.get(catId)
      const amount = expense.amount / 100

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
