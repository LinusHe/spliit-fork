import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getCategoryExpensesProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      categoryId: z.number(),
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, categoryId, participantId } }) => {
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        categoryId,
        isReimbursement: false,
        ...(participantId ? { paidById: participantId } : {}),
      },
      select: {
        id: true,
        title: true,
        amount: true,
        expenseDate: true,
        paidBy: { select: { id: true, name: true } },
        category: { select: { id: true, grouping: true, name: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    })

    return expenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount / 100,
      expenseDate: e.expenseDate,
      paidByName: e.paidBy?.name ?? 'Unknown',
    }))
  })
