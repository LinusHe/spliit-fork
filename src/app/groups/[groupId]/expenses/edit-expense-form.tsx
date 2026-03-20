'use client'
import { Button } from '@/components/ui/button'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { amountAsDecimal, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
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
  const t = useTranslations('ExpenseForm')
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
  if (expense.amount != null) duplicateParams.set('amount', String(amountAsDecimal(expense.amount, groupCurrency)))
  if (expense.paidBy?.id) duplicateParams.set('from', expense.paidBy.id)
  if (expense.category?.id != null) duplicateParams.set('categoryId', String(expense.category.id))
  if (expense.isReimbursement) duplicateParams.set('reimbursement', '1')
  const duplicateUrl = `/groups/${groupId}/expenses/create?${duplicateParams.toString()}`

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={duplicateUrl}>
            <Copy className="w-4 h-4 mr-1.5" />
            {t('duplicate')}
          </Link>
        </Button>
      </div>
      <ExpenseForm
        group={group}
        expense={expense}
        categories={categories}
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
    </>
  )
}
