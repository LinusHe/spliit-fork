import { Currency } from '@/lib/currency'
import { amountAsDecimal } from '@/lib/utils'
import { SplitMode } from '@prisma/client'

type DuplicableExpense = {
  title: string
  amount: number
  isReimbursement: boolean
  splitMode: SplitMode
  paidBy?: { id: string } | null
  category?: { id: number } | null
  paidFor: { participantId: string; shares: number }[]
}

export type DuplicatedSplit = {
  splitMode: SplitMode
  paidFor: { participant: string; shares: string }[]
}

/** Create-form parameters that reproduce an expense, including its split. */
export function duplicateExpenseParams(
  expense: DuplicableExpense,
  currency: Currency,
) {
  const params = new URLSearchParams()
  if (expense.title) params.set('title', expense.title)
  if (expense.amount != null)
    params.set(
      'amount',
      // The reimbursement form (also used by "settle up") takes minor units.
      expense.isReimbursement
        ? String(expense.amount)
        : String(amountAsDecimal(expense.amount, currency)),
    )
  if (expense.paidBy?.id) params.set('from', expense.paidBy.id)
  if (expense.category?.id != null)
    params.set('categoryId', String(expense.category.id))
  if (expense.isReimbursement) {
    params.set('reimbursement', '1')
    if (expense.paidFor[0]) params.set('to', expense.paidFor[0].participantId)
  }
  // Shares in the units the form edits: amounts for BY_AMOUNT, otherwise the
  // stored value / 100 (the same conversion as when editing an expense).
  const split: DuplicatedSplit = {
    splitMode: expense.splitMode,
    paidFor: expense.paidFor.map(({ participantId, shares }) => ({
      participant: participantId,
      shares:
        expense.splitMode === 'BY_AMOUNT'
          ? String(amountAsDecimal(shares, currency))
          : String(shares / 100),
    })),
  }
  params.set('split', JSON.stringify(split))
  return params
}

/** Reads the `split` parameter; ignores it if participants no longer exist. */
export function parseDuplicatedSplit(
  value: string | null,
  participantIds: string[],
): DuplicatedSplit | undefined {
  if (!value) return undefined
  try {
    const split = JSON.parse(value) as DuplicatedSplit
    if (
      !Object.values(SplitMode).includes(split.splitMode) ||
      !Array.isArray(split.paidFor) ||
      split.paidFor.length === 0 ||
      split.paidFor.some(
        (p) =>
          !participantIds.includes(p.participant) ||
          typeof p.shares !== 'string',
      )
    )
      return undefined
    return split
  } catch {
    return undefined
  }
}
