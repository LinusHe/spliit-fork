'use client'

import { ActiveUserModal } from '@/app/groups/[groupId]/expenses/active-user-modal'
import { CreateFromReceiptButton } from '@/app/groups/[groupId]/expenses/create-from-receipt-button'
import { ExpenseList } from '@/app/groups/[groupId]/expenses/expense-list'
import ExportButton from '@/app/groups/[groupId]/export-button'
import { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { useCurrentGroup } from '../current-group-context'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Expenses',
}

export default function GroupExpensesPageClient({
  enableReceiptExtract,
}: {
  enableReceiptExtract: boolean
}) {
  const t = useTranslations('Expenses')
  const { groupId } = useCurrentGroup()

  return (
    <>
      <section>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <div className="flex gap-2">
            <ExportButton groupId={groupId} />
            {enableReceiptExtract && <CreateFromReceiptButton />}
          </div>
        </div>
        <div className="-mx-4">
          <ExpenseList />
        </div>
      </section>

      <ActiveUserModal groupId={groupId} />
    </>
  )
}
