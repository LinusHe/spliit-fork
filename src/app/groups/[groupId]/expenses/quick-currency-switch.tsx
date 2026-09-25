'use client'

import { getCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

/**
 * One-tap currency choice for the expense: the group currency plus the
 * group's payment currencies and those it used before (e.g. EUR | ALL for a
 * trip to Albania), so the long currency list rarely needs to be opened.
 */
export function QuickCurrencySwitch({
  codes,
  value,
  onChange,
}: {
  /** Group currency first. */
  codes: string[]
  value: string
  onChange: (code: string) => void
}) {
  const t = useTranslations('ExpenseForm.QuickCurrency')
  const locale = useLocale()
  if (codes.length < 2) return null
  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      data-testid="quick-currency-switch"
      className="flex flex-wrap gap-2"
    >
      {codes.map((code) => {
        const currency = getCurrency(code, locale as any)
        const active = code === value
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(code)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-accent',
            )}
          >
            {code}
            {currency.symbol_native && currency.symbol_native !== code && (
              <span className={cn(!active && 'text-muted-foreground')}>
                {currency.symbol_native}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
