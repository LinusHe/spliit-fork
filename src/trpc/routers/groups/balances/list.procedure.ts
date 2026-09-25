import { getGroupExpenses } from '@/lib/api'
import {
  getBalances,
  getDirectSettlements,
  getPublicBalances,
  getSuggestedReimbursements,
} from '@/lib/balances'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupBalancesProcedure = baseProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => {
    const expenses = await getGroupExpenses(groupId)
    const balances = getBalances(expenses)
    const reimbursements = getSuggestedReimbursements(balances)
    const publicBalances = getPublicBalances(reimbursements)

    return {
      balances: publicBalances,
      reimbursements,
      // Shares already paid back directly; already part of the balances.
      settlements: getDirectSettlements(expenses),
    }
  })
