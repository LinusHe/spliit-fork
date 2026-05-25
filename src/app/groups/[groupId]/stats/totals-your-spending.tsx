'use client'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

export function TotalsYourSpendings({
  totalParticipantSpendings = 0,
  currency,
}: {
  totalParticipantSpendings?: number
  currency: Currency
}) {
  const locale = useLocale()
  const t = useTranslations('Stats.Totals')

  const balance =
    totalParticipantSpendings < 0 ? 'yourEarnings' : 'yourSpendings'

  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{t(balance)}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">
        {formatCurrency(currency, Math.abs(totalParticipantSpendings), locale)}
      </div>
    </div>
  )
}
