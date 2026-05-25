import { Balances } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { cn, formatCurrency } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { useLocale } from 'next-intl'

type Props = {
  balances: Balances
  participants: Participant[]
  currency: Currency
}

export function BalancesList({ balances, participants, currency }: Props) {
  const locale = useLocale()
  const maxBalance = Math.max(
    ...Object.values(balances).map((b) => Math.abs(b.total)),
    1,
  )

  return (
    <div className="flex flex-col gap-3">
      {participants.map((participant) => {
        const balance = balances[participant.id]?.total ?? 0
        const isPositive = balance > 0
        const isNegative = balance < 0
        const width = (Math.abs(balance) / maxBalance) * 100
        return (
          <div key={participant.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{participant.name}</span>
              <span
                className={cn(
                  'tabular-nums font-semibold whitespace-nowrap',
                  isPositive && 'text-emerald-600 dark:text-emerald-400',
                  isNegative && 'text-red-600 dark:text-red-400',
                  !isPositive && !isNegative && 'text-muted-foreground',
                )}
              >
                {isPositive && '+'}
                {formatCurrency(currency, balance, locale)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isPositive && 'bg-emerald-500/70 dark:bg-emerald-500/60',
                  isNegative && 'bg-red-500/70 dark:bg-red-500/60',
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
