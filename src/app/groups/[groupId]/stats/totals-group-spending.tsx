import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

type Props = {
  totalGroupSpendings: number
  currency: Currency
}

export function TotalsGroupSpending({ totalGroupSpendings, currency }: Props) {
  const locale = useLocale()
  const t = useTranslations('Stats.Totals')
  const balance = totalGroupSpendings < 0 ? 'groupEarnings' : 'groupSpendings'
  return (
    <div>
      <div className="text-sm text-muted-foreground">{t(balance)}</div>
      <div className="text-3xl font-semibold tabular-nums tracking-tight mt-1">
        {formatCurrency(currency, Math.abs(totalGroupSpendings), locale)}
      </div>
    </div>
  )
}
