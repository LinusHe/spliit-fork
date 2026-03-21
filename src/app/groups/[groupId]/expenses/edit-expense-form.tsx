'use client'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { amountAsDecimal, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useRouter } from 'next/navigation'
import { ExpenseForm } from './expense-form'

export function EditExpenseForm({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { data: groupData } = trpc.groups.get.useQuery({ groupId })
  const group = groupData?.group

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const { data: expenseData } = trpc.groups.expenses.get.useQuery({
    groupId,
    expenseId,
  })
  const expense = expenseData?.expense

  const { mutateAsync: updateExpenseMutateAsync } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteExpenseMutateAsync } =
    trpc.groups.expenses.delete.useMutation()

  const utils = trpc.useUtils()
  const router = useRouter()

  if (!group || !categories || !expense) return null

  // Build duplicate link with query params
  const duplicateParams = new URLSearchParams()
  if (expense.title) duplicateParams.set('title', expense.title)
  const groupCurrency = getCurrencyFromGroup(group)
  if (expense.amount != null)
    duplicateParams.set(
      'amount',
      String(amountAsDecimal(expense.amount, groupCurrency)),
    )
  if (expense.paidBy?.id) duplicateParams.set('from', expense.paidBy.id)
  if (expense.category?.id != null)
    duplicateParams.set('categoryId', String(expense.category.id))
  if (expense.isReimbursement) duplicateParams.set('reimbursement', '1')
  const duplicateUrl = `/groups/${groupId}/expenses/create?${duplicateParams.toString()}`

  return (
    <ExpenseForm
      group={group}
      expense={expense}
      categories={categories}
      duplicateUrl={duplicateUrl}
      onSubmit={async (expenseFormValues, participantId) => {
        await updateExpenseMutateAsync({
          expenseId,
          groupId,
          expenseFormValues,
          participantId,
        })
        utils.groups.expenses.invalidate()
        router.push(`/groups/${group.id}`)
      }}
      onDelete={async (participantId) => {
        await deleteExpenseMutateAsync({
          expenseId,
          groupId,
          participantId,
        })
        utils.groups.expenses.invalidate()
        router.push(`/groups/${group.id}`)
      }}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
