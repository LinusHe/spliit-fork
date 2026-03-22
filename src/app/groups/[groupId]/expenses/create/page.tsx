import { getRuntimeFeatureFlags } from '@/lib/featureFlags'
import { Metadata } from 'next'
import { CreateExpenseRedirect } from './create-expense-redirect'

export const metadata: Metadata = {
  title: 'Create Expense',
}

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const runtimeFeatureFlags = await getRuntimeFeatureFlags()
  return (
    <CreateExpenseRedirect
      groupId={groupId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
