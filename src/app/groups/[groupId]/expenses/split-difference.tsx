'use client'

import { Button } from '@/components/ui/button'
import { Currency } from '@/lib/currency'
import { distributeAmount } from '@/lib/shares'
import {
  amountAsMinorUnits,
  formatAmountAsDecimal,
  formatCurrency,
} from '@/lib/utils'
import { SplitMode } from '@prisma/client'
import { AlertCircle, Split } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

type PaidFor = { participant: string; shares: unknown; originalAmount?: string }

/** A share as typed in the form, in minor units (cents or basis points). */
function toUnits(shares: unknown, splitMode: SplitMode, currency: Currency) {
  const value = Number(String(shares ?? '').replace(',', '.'))
  if (String(shares ?? '').trim() === '' || !Number.isFinite(value)) return 0
  return splitMode === 'BY_AMOUNT'
    ? amountAsMinorUnits(value, currency)
    : Math.round(value * 100)
}

function fromUnits(units: number, splitMode: SplitMode, currency: Currency) {
  return splitMode === 'BY_AMOUNT'
    ? formatAmountAsDecimal(units, currency)
    : String(units / 100)
}

/**
 * Shows how far the typed amounts / percentages are from the total and offers
 * to spread the difference evenly over everyone in the split — e.g. the tip of
 * a restaurant bill whose items were entered per person (upstream #639, plus
 * the even distribution).
 */
export function SplitDifference({
  splitMode,
  amount,
  paidFor,
  currency,
  onDistribute,
}: {
  splitMode: SplitMode
  amount: unknown
  paidFor: PaidFor[]
  currency: Currency
  onDistribute: (paidFor: PaidFor[]) => void
}) {
  const t = useTranslations('ExpenseForm.SplitDifference')
  const locale = useLocale()
  if (splitMode !== 'BY_AMOUNT' && splitMode !== 'BY_PERCENTAGE') return null
  if (!paidFor.length) return null

  const total =
    splitMode === 'BY_AMOUNT'
      ? amountAsMinorUnits(Number(amount) || 0, currency)
      : 10000
  if (!total) return null
  const sum = paidFor.reduce(
    (sum, { shares }) => sum + toUnits(shares, splitMode, currency),
    0,
  )
  const difference = total - sum
  if (difference === 0) return null

  const format = (units: number) =>
    splitMode === 'BY_AMOUNT'
      ? formatCurrency(currency, units, locale)
      : `${(units / 100).toLocaleString(locale)} %`
  const missing = difference > 0

  const distribute = () => {
    const parts = distributeAmount(Math.abs(difference), paidFor.length)
    onDistribute(
      paidFor.map((p, index) => ({
        participant: p.participant,
        // Per-row amounts in the original currency no longer match; they are
        // only an input aid and are not saved.
        shares: fromUnits(
          toUnits(p.shares, splitMode, currency) +
            Math.sign(difference) * parts[index],
          splitMode,
          currency,
        ),
      })),
    )
  }

  return (
    <div
      data-testid="split-difference"
      className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">
            {t(missing ? 'missing' : 'surplus', {
              amount: format(Math.abs(difference)),
            })}
          </p>
          <p className="text-xs opacity-80">
            {t('sum', { sum: format(sum), total: format(total) })}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 bg-background"
        onClick={distribute}
      >
        <Split className="mr-1.5 h-3.5 w-3.5" />
        {t(missing ? 'distributeMissing' : 'distributeSurplus', {
          amount: format(Math.abs(difference)),
        })}
      </Button>
    </div>
  )
}
