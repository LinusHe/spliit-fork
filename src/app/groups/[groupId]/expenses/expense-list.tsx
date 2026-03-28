'use client'
import { ExpenseCard } from '@/app/groups/[groupId]/expenses/expense-card'
import { getGroupExpensesAction } from '@/app/groups/[groupId]/expenses/expense-list-fetch-action'
import { Button } from '@/components/ui/button'
import { SearchBar } from '@/components/ui/search-bar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ExpenseFilterDrawer,
  type ExpenseFilters,
} from './expense-filters'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import dayjs, { type Dayjs } from 'dayjs'
import 'dayjs/locale/de'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { forwardRef, useEffect, useMemo, useState } from 'react'
import { useInView } from 'react-intersection-observer'
import { useDebounce } from 'use-debounce'
import { useCurrentGroup } from '../current-group-context'

const PAGE_SIZE = 20

type ExpensesType = NonNullable<
  Awaited<ReturnType<typeof getGroupExpensesAction>>
>

const EXPENSE_GROUPS = {
  UPCOMING: 'upcoming',
  THIS_WEEK: 'thisWeek',
  EARLIER_THIS_MONTH: 'earlierThisMonth',
  LAST_MONTH: 'lastMonth',
  EARLIER_THIS_YEAR: 'earlierThisYear',
  LAST_YEAR: 'lastYear',
  OLDER: 'older',
}

function getExpenseGroup(date: Dayjs, today: Dayjs) {
  if (today.isBefore(date)) {
    return EXPENSE_GROUPS.UPCOMING
  } else if (today.isSame(date, 'week')) {
    return EXPENSE_GROUPS.THIS_WEEK
  } else if (today.isSame(date, 'month')) {
    return EXPENSE_GROUPS.EARLIER_THIS_MONTH
  } else if (today.subtract(1, 'month').isSame(date, 'month')) {
    return EXPENSE_GROUPS.LAST_MONTH
  } else if (today.isSame(date, 'year')) {
    return EXPENSE_GROUPS.EARLIER_THIS_YEAR
  } else if (today.subtract(1, 'year').isSame(date, 'year')) {
    return EXPENSE_GROUPS.LAST_YEAR
  } else {
    return EXPENSE_GROUPS.OLDER
  }
}

function getGroupedExpensesByDate(expenses: ExpensesType) {
  const today = dayjs()
  return expenses.reduce((result: { [key: string]: ExpensesType }, expense) => {
    const expenseGroup = getExpenseGroup(dayjs(expense.expenseDate), today)
    result[expenseGroup] = result[expenseGroup] ?? []
    result[expenseGroup].push(expense)
    return result
  }, {})
}

export function ExpenseList() {
  const { groupId, group } = useCurrentGroup()
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText] = useDebounce(searchText, 300)
  const [filters, setFilters] = useState<ExpenseFilters>({})

  const participants = group?.participants

  useEffect(() => {
    if (!participants) return

    const activeUser = localStorage.getItem('newGroup-activeUser')
    const newUser = localStorage.getItem(`${groupId}-newUser`)
    if (activeUser || newUser) {
      localStorage.removeItem('newGroup-activeUser')
      localStorage.removeItem(`${groupId}-newUser`)
      if (activeUser === 'None') {
        localStorage.setItem(`${groupId}-activeUser`, 'None')
      } else {
        const userId = participants.find(
          (p) => p.name === (activeUser || newUser),
        )?.id
        if (userId) {
          localStorage.setItem(`${groupId}-activeUser`, userId)
        }
      }
    }
  }, [groupId, participants])

  return (
    <>
      <div className="flex items-center gap-2 mx-4 sm:mx-6">
        <div className="flex-1">
          <SearchBar
            onValueChange={(value) => setSearchText(value)}
            className="!mx-0"
          />
        </div>
        <ExpenseFilterDrawer filters={filters} onChange={setFilters} />
      </div>
      <ExpenseListForSearch
        groupId={groupId}
        searchText={debouncedSearchText}
        filters={filters}
      />
    </>
  )
}

function DateDivider({ date, locale }: { date: string; locale: string }) {
  const d = dayjs(date).locale(locale)
  const isToday = d.isSame(dayjs(), 'day')
  const isYesterday = d.isSame(dayjs().subtract(1, 'day'), 'day')

  let label: string
  if (isToday) {
    label = locale.startsWith('de') ? 'Heute' : 'Today'
  } else if (isYesterday) {
    label = locale.startsWith('de') ? 'Gestern' : 'Yesterday'
  } else {
    label = d.format('dd, D. MMMM')
  }

  return (
    <div className="flex items-center gap-3 px-4 sm:px-6 py-1.5">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

const ExpenseListForSearch = ({
  groupId,
  searchText,
  filters,
}: {
  groupId: string
  searchText: string
  filters: ExpenseFilters
}) => {
  const utils = trpc.useUtils()
  const { group } = useCurrentGroup()
  const locale = useLocale()

  useEffect(() => {
    // Until we use tRPC more widely and can invalidate the cache on expense
    // update, it's easier and safer to invalidate the cache on page load.
    utils.groups.expenses.invalidate()
  }, [utils])

  const t = useTranslations('Expenses')
  const { ref: loadingRef, inView } = useInView()

  const {
    data,
    isLoading: expensesAreLoading,
    fetchNextPage,
  } = trpc.groups.expenses.list.useInfiniteQuery(
    {
      groupId,
      limit: PAGE_SIZE,
      filter: searchText || undefined,
      categoryGrouping: filters.categoryGrouping,
      locationName: filters.locationName,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
      participantId: filters.participantId,
    },
    { getNextPageParam: ({ nextCursor }) => nextCursor },
  )
  const expenses = data?.pages.flatMap((page) => page.expenses)
  const hasMore = data?.pages.at(-1)?.hasMore ?? false

  const isLoading = expensesAreLoading || !expenses || !group

  useEffect(() => {
    if (inView && hasMore && !isLoading) fetchNextPage()
  }, [fetchNextPage, hasMore, inView, isLoading])

  const groupedExpensesByDate = useMemo(
    () => (expenses ? getGroupedExpensesByDate(expenses) : {}),
    [expenses],
  )

  if (isLoading) return <ExpensesLoading />

  const hasActiveFilters =
    !!searchText ||
    filters.categoryGrouping !== undefined ||
    filters.locationName !== undefined ||
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.participantId !== undefined

  if (expenses.length === 0)
    return (
      <p className="px-6 text-sm py-6 text-muted-foreground">
        {hasActiveFilters ? (
          t('noResults')
        ) : (
          <>
            {t('noExpenses')}{' '}
            <Button variant="link" asChild className="-m-4">
              <Link href={`/groups/${groupId}/expenses/create`}>
                {t('createFirst')}
              </Link>
            </Button>
          </>
        )}
      </p>
    )

  return (
    <>
      {Object.values(EXPENSE_GROUPS).map((expenseGroup: string) => {
        let groupExpenses = groupedExpensesByDate[expenseGroup]
        if (!groupExpenses || groupExpenses.length === 0) return null

        return (
          <div key={expenseGroup}>
            <div
              className={
                'text-muted-foreground text-xs pl-4 sm:pl-6 py-1 font-semibold sticky top-14 z-10 bg-white dark:bg-[#1b1917]'
              }
            >
              {t(`Groups.${expenseGroup}`)}
            </div>
            {groupExpenses.map((expense, idx) => {
              const dateKey = dayjs(expense.expenseDate).format('YYYY-MM-DD')
              const prevDateKey =
                idx > 0
                  ? dayjs(groupExpenses[idx - 1].expenseDate).format(
                      'YYYY-MM-DD',
                    )
                  : null
              const showDivider = idx === 0 || dateKey !== prevDateKey

              return (
                <div key={expense.id}>
                  {showDivider && (
                    <DateDivider date={dateKey} locale={locale} />
                  )}
                  <ExpenseCard
                    expense={expense}
                    currency={getCurrencyFromGroup(group)}
                    groupId={groupId}
                    participantCount={group.participants.length}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
      {hasMore && <ExpensesLoading ref={loadingRef} />}
    </>
  )
}

const ExpensesLoading = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref}>
      <Skeleton className="mx-4 sm:mx-6 mt-1 mb-2 h-3 w-32 rounded-full" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex justify-between items-start px-2 sm:px-6 py-4 text-sm gap-2"
        >
          <div className="flex-0 pl-2 pr-1">
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-32 rounded-full" />
          </div>
          <div className="flex-0 flex flex-col gap-2 items-end mr-2 sm:mr-12">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
})
ExpensesLoading.displayName = 'ExpensesLoading'
