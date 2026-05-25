'use client'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

export function TotalsYourShare({
  totalParticipantShare = 0,
  currency,
}: {
  totalParticipantShare?: number
  currency: Currency
}) {
  const locale = useLocale()
  const t = useTranslations('Stats.Totals')

  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{t('yourShare')}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">
        {formatCurrency(currency, Math.abs(totalParticipantShare), locale)}
      </div>
    </div>
  )
}
