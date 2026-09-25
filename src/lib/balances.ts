import { getGroupExpenses } from '@/lib/api'
import { getExpenseShares } from '@/lib/shares'
import { Participant } from '@prisma/client'

export type Balances = Record<
  Participant['id'],
  { paid: number; paidFor: number; total: number }
>

export type Reimbursement = {
  from: Participant['id']
  to: Participant['id']
  amount: number
}

type BalanceExpense = NonNullable<
  Awaited<ReturnType<typeof getGroupExpenses>>
>[number]

/** Shares of an expense marked as already paid back to its payer. */
function settledShares(
  expense: BalanceExpense,
  dividedAmounts: Map<string, number>,
) {
  if (expense.isReimbursement) return []
  return expense.paidFor.flatMap(({ participant, settledAt }) =>
    settledAt && participant.id !== expense.paidBy.id
      ? [
          {
            participantId: participant.id,
            amount: dividedAmounts.get(participant.id) ?? 0,
          },
        ]
      : [],
  )
}

/**
 * Money already paid back directly per expense ("marked as paid"), summed per
 * pair. Shown on the balances tab and next to manual reimbursements so nobody
 * settles the same amount twice.
 */
export function getDirectSettlements(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): (Reimbursement & { expenses: number })[] {
  const pairs = new Map<string, Reimbursement & { expenses: number }>()
  for (const expense of expenses) {
    const shares = settledShares(
      expense,
      getExpenseShares({
        id: expense.id,
        amount: expense.amount,
        splitMode: expense.splitMode,
        paidFor: expense.paidFor.map(({ participant, shares }) => ({
          participantId: participant.id,
          shares,
        })),
      }),
    )
    for (const { participantId, amount } of shares) {
      const key = `${participantId}>${expense.paidBy.id}`
      const pair = pairs.get(key) ?? {
        from: participantId,
        to: expense.paidBy.id,
        amount: 0,
        expenses: 0,
      }
      pair.amount += amount
      pair.expenses += 1
      pairs.set(key, pair)
    }
  }
  return Array.from(pairs.values()).filter((p) => p.amount !== 0)
}

export function getBalances(
  expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>,
): Balances {
  const balances: Balances = {}

  for (const expense of expenses) {
    const paidBy = expense.paidBy.id

    if (!balances[paidBy]) balances[paidBy] = { paid: 0, paidFor: 0, total: 0 }
    balances[paidBy].paid += expense.amount

    const dividedAmounts = getExpenseShares({
      id: expense.id,
      amount: expense.amount,
      splitMode: expense.splitMode,
      paidFor: expense.paidFor.map(({ participant, shares }) => ({
        participantId: participant.id,
        shares,
      })),
    })

    dividedAmounts.forEach((dividedAmount, participantId) => {
      if (!balances[participantId])
        balances[participantId] = { paid: 0, paidFor: 0, total: 0 }

      balances[participantId].paidFor += dividedAmount
    })

    // A share already paid back directly counts exactly like a reimbursement
    // of that share from the participant to the payer.
    for (const { participantId, amount } of settledShares(
      expense,
      dividedAmounts,
    )) {
      balances[participantId].paid += amount
      balances[paidBy].paidFor += amount
    }
  }

  // Every share is apportioned as a whole minor unit, so the rounding below is
  // a no-op and only kept as a guard. It is what used to break the books: the
  // accumulated float totals were rounded per participant, which does not
  // preserve a sum, and the residue ended up in the group's total balance.
  for (const participantId in balances) {
    // add +0 to avoid negative zeros
    balances[participantId].paidFor =
      Math.round(balances[participantId].paidFor) + 0
    balances[participantId].paid = Math.round(balances[participantId].paid) + 0

    balances[participantId].total =
      balances[participantId].paid - balances[participantId].paidFor
  }
  return balances
}

export function getPublicBalances(reimbursements: Reimbursement[]): Balances {
  const balances: Balances = {}
  reimbursements.forEach((reimbursement) => {
    if (!balances[reimbursement.from])
      balances[reimbursement.from] = { paid: 0, paidFor: 0, total: 0 }

    if (!balances[reimbursement.to])
      balances[reimbursement.to] = { paid: 0, paidFor: 0, total: 0 }

    balances[reimbursement.from].paidFor += reimbursement.amount
    balances[reimbursement.from].total -= reimbursement.amount

    balances[reimbursement.to].paid += reimbursement.amount
    balances[reimbursement.to].total += reimbursement.amount
  })
  return balances
}

/**
 * A comparator that is stable across reimbursements.
 * This ensures that a participant executing a suggested reimbursement
 * does not result in completely new repayment suggestions.
 */
function compareBalancesForReimbursements(b1: any, b2: any): number {
  // positive balances come before negative balances
  if (b1.total > 0 && 0 > b2.total) {
    return -1
  } else if (b2.total > 0 && 0 > b1.total) {
    return 1
  }
  // if signs match, sort based on userid
  return b1.participantId < b2.participantId ? -1 : 1
}

export function getSuggestedReimbursements(
  balances: Balances,
): Reimbursement[] {
  const balancesArray = Object.entries(balances)
    .map(([participantId, { total }]) => ({ participantId, total }))
    .filter((b) => b.total !== 0)
  balancesArray.sort(compareBalancesForReimbursements)
  const reimbursements: Reimbursement[] = []
  while (balancesArray.length > 1) {
    const first = balancesArray[0]
    const last = balancesArray[balancesArray.length - 1]
    const amount = first.total + last.total
    if (first.total > -last.total) {
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: -last.total,
      })
      first.total = amount
      balancesArray.pop()
    } else {
      reimbursements.push({
        from: last.participantId,
        to: first.participantId,
        amount: first.total,
      })
      last.total = amount
      balancesArray.shift()
    }
  }
  return reimbursements.filter(({ amount }) => Math.round(amount) + 0 !== 0)
}
