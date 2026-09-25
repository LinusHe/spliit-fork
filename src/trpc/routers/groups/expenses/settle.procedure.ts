import { settleExpenseShares } from '@/lib/api'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

/**
 * Marks shares as already paid back directly. In the app this goes through the
 * offline queue (see lib/offline/link.ts, kind "settle"); the procedure keeps
 * the API complete and typed for tRPC.
 */
export const settleGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1).max(100),
      expenseId: z.string().min(1).max(100),
      participantIds: z.array(z.string().min(1).max(100)).min(1).max(100),
      settled: z.boolean(),
      participantId: z.string().optional(),
      baseVersion: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const expense = await settleExpenseShares(
      input.groupId,
      input.expenseId,
      input.participantIds,
      input.settled,
      input.participantId,
    )
    return {
      baseVersion: input.baseVersion ?? null,
      version: expense?.syncVersion ?? null,
    }
  })
