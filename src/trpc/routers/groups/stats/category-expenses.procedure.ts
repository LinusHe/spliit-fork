import { participantShareOf } from '@/lib/shares'
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
      },
      select: {
        id: true,
        title: true,
        amount: true,
        splitMode: true,
        expenseDate: true,
        paidBy: { select: { id: true, name: true } },
        paidFor: {
          select: {
            participant: { select: { id: true } },
            shares: true,
          },
        },
        category: { select: { id: true, grouping: true, name: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    })

    return expenses
      .map((e) => {
        let amount: number

        if (participantId) {
          const share = participantShareOf(participantId, e)
          if (share === null) return null
          // Same apportionment as the balances: whole minor units, no drift.
          amount = share / 100
        } else {
          amount = e.amount / 100
        }

        return {
          id: e.id,
          title: e.title,
          amount,
          expenseDate: e.expenseDate,
          paidByName: e.paidBy?.name ?? 'Unknown',
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
  })
