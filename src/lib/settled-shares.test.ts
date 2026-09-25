import { getGroupExpenses } from '@/lib/api'
import {
  getBalances,
  getDirectSettlements,
  getSuggestedReimbursements,
} from './balances'

type Expense = NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>[number]

function expense(
  paidBy: string,
  amount: number,
  paidFor: string[],
  settled: string[] = [],
  isReimbursement = false,
): Expense {
  return {
    id: `${paidBy}-${amount}`,
    amount,
    isReimbursement,
    splitMode: 'EVENLY',
    paidBy: { id: paidBy, name: paidBy },
    paidFor: paidFor.map((id) => ({
      participant: { id, name: id },
      shares: 100,
      settledAt: settled.includes(id) ? new Date() : null,
    })),
  } as Expense
}

describe('shares marked as already paid back', () => {
  it('settle the participant with the payer like a reimbursement', () => {
    const balances = getBalances([
      expense('alice', 3000, ['alice', 'bob', 'carol'], ['bob']),
    ])
    expect(balances.bob.total).toBe(0)
    expect(balances.carol.total).toBe(-1000)
    expect(balances.alice.total).toBe(1000)
  })

  it('equal a separate reimbursement entry', () => {
    const marked = getBalances([
      expense('alice', 3000, ['alice', 'bob'], ['bob']),
    ])
    const entry = getBalances([
      expense('alice', 3000, ['alice', 'bob']),
      expense('bob', 1500, ['alice'], [], true),
    ])
    expect(marked.alice.total).toBe(entry.alice.total)
    expect(marked.bob.total).toBe(entry.bob.total)
  })

  it('leave nothing to settle when everyone paid back', () => {
    const balances = getBalances([
      expense('alice', 1000, ['alice', 'bob', 'carol'], ['bob', 'carol']),
    ])
    expect(getSuggestedReimbursements(balances)).toEqual([])
    // Uneven split: the shares (333/333/334) are settled to the cent.
    expect(Object.values(balances).map((b) => b.total)).toEqual([0, 0, 0])
  })

  it('ignore the payer and reimbursement entries', () => {
    const balances = getBalances([
      expense('alice', 2000, ['alice', 'bob'], ['alice']),
      expense('bob', 500, ['alice'], ['alice'], true),
    ])
    expect(balances.bob.total).toBe(-500)
  })

  it('are summed per pair for display', () => {
    expect(
      getDirectSettlements([
        expense('alice', 3000, ['alice', 'bob'], ['bob']),
        expense('alice', 1000, ['alice', 'bob'], ['bob']),
        expense('carol', 600, ['bob', 'carol']),
      ]),
    ).toEqual([{ from: 'bob', to: 'alice', amount: 2000, expenses: 2 }])
  })
})
