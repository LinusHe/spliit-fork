'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Currency } from '@/lib/currency'
import { useActiveUser } from '@/lib/hooks'
import { getExpenseShares } from '@/lib/shares'
import { formatCurrency } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { SplitMode } from '@prisma/client'
import { CheckCircle2, HandCoins } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

type SettleExpense = {
  id: string
  groupId: string
  amount: number
  splitMode: SplitMode
  isReimbursement: boolean
  paidById: string
  paidFor: { participantId: string; shares: number; settledAt: Date | null }[]
}

/**
 * "Already paid back?" — marks participants' shares of an expense as settled
 * directly (e.g. cash during a trip) without a separate reimbursement entry.
 * Saved immediately (also offline), independent of the form's save button.
 */
export function SettleShares({
  expense,
  participants,
  currency,
  onSettled,
}: {
  expense: SettleExpense
  participants: { id: string; name: string }[]
  currency: Currency
  /** The expense got a new version through this user's own mark. */
  onSettled: (baseVersion: string | null, version: string | null) => void
}) {
  const t = useTranslations('ExpenseForm.Settle')
  const locale = useLocale()
  const activeUserId = useActiveUser(expense.groupId)
  const { mutateAsync } = trpc.groups.expenses.settle.useMutation()
  const utils = trpc.useUtils()
  const [busy, setBusy] = useState(false)

  if (expense.isReimbursement) return null
  const debtors = expense.paidFor.filter(
    (p) => p.participantId !== expense.paidById,
  )
  if (!debtors.length) return null

  const shares = getExpenseShares({
    id: expense.id,
    amount: expense.amount,
    splitMode: expense.splitMode,
    paidFor: expense.paidFor,
  })
  const name = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? '–'
  const open = debtors.filter((p) => !p.settledAt)
  const allSettled = open.length === 0

  const settle = async (participantIds: string[], settled: boolean) => {
    setBusy(true)
    try {
      const result = (await mutateAsync({
        groupId: expense.groupId,
        expenseId: expense.id,
        participantIds,
        settled,
        participantId:
          activeUserId && activeUserId !== 'None' ? activeUserId : undefined,
      })) as { baseVersion?: string | null; version?: string | null }
      onSettled(result.baseVersion ?? null, result.version ?? null)
      void utils.groups.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    // Same card layout as "Gezahlt für" above it.
    <Card className="mt-4" data-testid="settle-shares">
      <CardHeader>
        <CardTitle className="flex justify-between">
          <span>{allSettled ? t('allSettled') : t('title')}</span>
          {open.length > 1 && (
            <Button
              variant="link"
              type="button"
              className="-my-2 -mx-4"
              disabled={busy}
              onClick={() =>
                void settle(
                  open.map((p) => p.participantId),
                  true,
                )
              }
            >
              {t('settleAll')}
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          {t('description', { payer: name(expense.paidById) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-0">
        {debtors.map((p) => (
          <div
            key={p.participantId}
            className="flex items-center gap-3 border-t -mx-6 px-6 py-3"
          >
            <label
              htmlFor={`settle-${p.participantId}`}
              className="flex-1 text-sm"
            >
              {name(p.participantId)}
              <span className="text-muted-foreground ml-2">
                ({formatCurrency(currency, shares.get(p.participantId) ?? 0, locale)})
              </span>
              {p.settledAt && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('paid')}
                </span>
              )}
            </label>
            <Switch
              id={`settle-${p.participantId}`}
              aria-label={t('toggle', { name: name(p.participantId) })}
              checked={!!p.settledAt}
              disabled={busy}
              onCheckedChange={(checked) =>
                void settle([p.participantId], checked)
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * On a manual reimbursement: points out money the same person already paid
 * back directly in single expenses, so it is not settled twice.
 */
export function SettledHint({
  groupId,
  enabled,
  from,
  to,
  participants,
  currency,
}: {
  groupId: string
  enabled: boolean
  from?: string
  to?: string
  participants: { id: string; name: string }[]
  currency: Currency
}) {
  const t = useTranslations('ExpenseForm.SettledHint')
  const locale = useLocale()
  const { data } = trpc.groups.balances.list.useQuery(
    { groupId },
    { enabled },
  )
  if (!enabled || !from || !to) return null
  const settlement = data?.settlements?.find(
    (s) => s.from === from && s.to === to,
  )
  if (!settlement) return null
  const name = (id: string) =>
    participants.find((p) => p.id === id)?.name ?? '–'
  return (
    <p
      data-testid="settled-hint"
      className="mb-4 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-50"
    >
      <HandCoins className="mt-0.5 h-4 w-4 shrink-0" />
      {t('text', {
        from: name(from),
        to: name(to),
        amount: formatCurrency(currency, settlement.amount, locale),
      })}
    </p>
  )
}
