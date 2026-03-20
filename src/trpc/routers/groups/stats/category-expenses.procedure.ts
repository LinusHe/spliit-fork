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
          const paidForEntry = e.paidFor.find(
            (pf) => pf.participant.id === participantId,
          )
          if (!paidForEntry) return null

          const totalShares = e.paidFor.reduce((sum, pf) => sum + (pf.shares ?? 0), 0)

          if (e.splitMode === 'EVENLY') {
            amount = (e.amount / e.paidFor.length) / 100
          } else if (e.splitMode === 'BY_SHARES' && totalShares > 0) {
            amount = (e.amount * (paidForEntry.shares ?? 0) / totalShares) / 100
          } else if (e.splitMode === 'BY_AMOUNT') {
            amount = (paidForEntry.shares ?? 0) / 100
          } else if (e.splitMode === 'BY_PERCENTAGE' && totalShares > 0) {
            amount = (e.amount * (paidForEntry.shares ?? 0) / totalShares) / 100
          } else {
            amount = (e.amount / e.paidFor.length) / 100
          }
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
