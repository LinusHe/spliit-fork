import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'
import { EditExpenseRedirect } from './edit-expense-redirect'

export const metadata: Metadata = {
  title: 'Edit Expense',
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>
}) {
  const { groupId, expenseId } = await params
  const runtimeFeatureFlags = await getRuntimeFeatureFlags()
  return (
    <EditExpenseRedirect
      groupId={groupId}
      expenseId={expenseId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
