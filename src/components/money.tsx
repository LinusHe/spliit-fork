'use client'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency } from '@/lib/utils'
import { useLocale } from 'next-intl'

type Props = {
  currency: Currency
  amount: number
  bold?: boolean
  colored?: boolean
}

export function Money({
  currency,
  amount,
  bold = false,
  colored = false,
}: Props) {
  const locale = useLocale()
  return (
    <span
      className={cn(
        colored && amount < 0 && 'text-red-600 dark:text-red-400',
        colored && amount > 0 && 'text-emerald-600 dark:text-emerald-400',
        colored && amount === 0 && 'text-muted-foreground',
        bold && 'font-bold',
      )}
    >
      {formatCurrency(currency, amount, locale)}
    </span>
  )
}
