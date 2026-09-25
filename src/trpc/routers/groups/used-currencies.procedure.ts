import { prisma } from '@/lib/prisma'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * Foreign currencies expenses of this group were paid in, most used first.
 * Offered at the top of the currency picker and in the quick switch.
 */
export const usedCurrenciesProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1).max(100) }))
  .query(async ({ input: { groupId } }) => {
    const rows = await prisma.expense.groupBy({
      by: ['originalCurrency'],
      where: { groupId, originalCurrency: { not: null } },
      _count: { _all: true },
    })
    return {
      currencies: rows
        .filter((r) => r.originalCurrency && r.originalCurrency.length === 3)
        .sort((a, b) => b._count._all - a._count._all)
        .map((r) => r.originalCurrency as string),
    }
  })
