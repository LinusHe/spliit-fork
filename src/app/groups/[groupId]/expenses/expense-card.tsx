'use client'
import { ActiveUserBalance } from '@/app/groups/[groupId]/expenses/active-user-balance'
import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { DocumentsCount } from '@/app/groups/[groupId]/expenses/documents-count'
import { Button } from '@/components/ui/button'
import { getGroupExpenses } from '@/lib/api'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency, formatDateOnly } from '@/lib/utils'
import { ArrowLeftRight, ChevronRight, CloudOff, MapPin } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Fragment } from 'react'
import { useExpenseDrawerOptional } from './expense-drawer-context'

type Expense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

function Participants({
  expense,
  participantCount,
}: {
  expense: Expense
  participantCount: number
}) {
  const t = useTranslations('ExpenseCard')
  const key = expense.amount > 0 ? 'paidBy' : 'receivedBy'
  const paidFor =
    expense.paidFor.length == participantCount && participantCount >= 4 ? (
      <strong>{t('everyone')}</strong>
    ) : (
      expense.paidFor.map((paidFor, index) => (
        <Fragment key={index}>
          {index !== 0 && <>, </>}
          <strong>{paidFor.participant.name}</strong>
        </Fragment>
      ))
    )

  const participants = t.rich(key, {
    strong: (chunks) => <strong>{chunks}</strong>,
    paidBy: expense.paidBy.name,
    paidFor: () => paidFor,
    forCount: expense.paidFor.length,
  })
  return <>{participants}</>
}

type Props = {
  expense: Expense
  currency: Currency
  groupId: string
  participantCount: number
  /** Local change not yet on the server (shown while offline). */
  pending?: boolean
}

export function ExpenseCard({
  expense,
  currency,
  groupId,
  participantCount,
  pending,
}: Props) {
  const locale = useLocale()
  const drawerCtx = useExpenseDrawerOptional()

  const handleClick = () => {
    if (drawerCtx) {
      drawerCtx.openExpense(expense.id)
    }
  }

  const editUrl = `/groups/${groupId}/expenses/${expense.id}/edit`

  return (
    <div
      key={expense.id}
      className={cn(
        'flex justify-between sm:mx-6 px-4 sm:rounded-lg sm:pr-2 sm:pl-4 py-4 text-sm cursor-pointer gap-1 items-stretch transition-colors',
        expense.isReimbursement
          ? 'bg-muted/40 hover:bg-muted/70 text-muted-foreground'
          : 'hover:bg-accent',
        pending &&
          'border-l-4 border-amber-400 bg-amber-50 pl-3 hover:bg-amber-100/70 dark:border-amber-500 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 sm:pl-3',
      )}
      data-pending={pending || undefined}
      onClick={handleClick}
    >
      {expense.isReimbursement ? (
        <ArrowLeftRight className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground shrink-0" />
      ) : (
        <CategoryIcon
          category={expense.category}
          className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground"
        />
      )}
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn(expense.isReimbursement && 'italic')}>
            {expense.title}
          </span>
          {pending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              <CloudOff className="h-3 w-3" />
              Noch nicht synchronisiert
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <Participants expense={expense} participantCount={participantCount} />
        </div>
        <div className="text-xs text-muted-foreground">
          <ActiveUserBalance {...{ groupId, currency, expense }} />
        </div>
        {expense.locationName && (
          <div className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{expense.locationName}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col justify-between items-end">
        <div
          className={cn(
            'tabular-nums whitespace-nowrap',
            expense.isReimbursement ? 'italic font-medium' : 'font-bold',
          )}
        >
          {formatCurrency(currency, expense.amount, locale)}
        </div>
        <div className="text-xs text-muted-foreground">
          <DocumentsCount count={expense._count.documents} />
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDateOnly(expense.expenseDate, locale, { dateStyle: 'medium' })}
        </div>
      </div>
      <Button
        size="icon"
        variant="link"
        className="self-center hidden sm:flex"
        role="link"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  )
}
