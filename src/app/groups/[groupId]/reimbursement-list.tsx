import { Button } from '@/components/ui/button'
import { Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { Participant } from '@prisma/client'
import { Check } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'

type Props = {
  reimbursements: Reimbursement[]
  participants: Participant[]
  currency: Currency
  groupId: string
}

export function ReimbursementList({
  reimbursements,
  participants,
  currency,
  groupId,
}: Props) {
  const locale = useLocale()
  const t = useTranslations('Balances.Reimbursements')
  if (reimbursements.length === 0) {
    return <p className="text-sm pb-6">{t('noImbursements')}</p>
  }

  const getParticipant = (id: string) => participants.find((p) => p.id === id)
  return (
    <div className="text-sm divide-y">
      {reimbursements.map((reimbursement, index) => (
        <div className="py-3 flex flex-col gap-2" key={index}>
          <div className="flex justify-between items-baseline gap-3">
            <div className="min-w-0">
              {t.rich('owes', {
                from: getParticipant(reimbursement.from)?.name ?? '',
                to: getParticipant(reimbursement.to)?.name ?? '',
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </div>
            <div className="tabular-nums font-semibold whitespace-nowrap">
              {formatCurrency(currency, reimbursement.amount, locale)}
            </div>
          </div>
          <Button variant="outline" size="sm" asChild className="self-end gap-1.5">
            <Link
              href={`/groups/${groupId}/expenses/create?reimbursement=yes&from=${reimbursement.from}&to=${reimbursement.to}&amount=${reimbursement.amount}`}
            >
              <Check className="w-3.5 h-3.5" />
              {t('markAsPaid')}
            </Link>
          </Button>
        </div>
      ))}
    </div>
  )
}
