'use client'
import { Button } from '@/components/ui/button'
import { DateTimeStyle, cn, formatDate } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { ActivityType, Participant } from '@prisma/client'
import { ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useExpenseDrawerOptional } from '../expenses/expense-drawer-context'

export type Activity =
  AppRouterOutput['groups']['activities']['list']['activities'][number]

type Props = {
  groupId: string
  activity: Activity
  participant?: Participant
  dateStyle: DateTimeStyle
}

function useSummary(activity: Activity, participantName?: string) {
  const t = useTranslations('Activity')
  const participant = participantName ?? t('someone')
  const expense = activity.data ?? ''

  const tr = (key: string) =>
    t.rich(key, {
      expense,
      participant,
      em: (chunks) => <em>&ldquo;{chunks}&rdquo;</em>,
      strong: (chunks) => <strong>{chunks}</strong>,
    })

  if (activity.activityType == ActivityType.UPDATE_GROUP) {
    return <>{tr('settingsModified')}</>
  } else if (activity.activityType == ActivityType.CREATE_EXPENSE) {
    return <>{tr('expenseCreated')}</>
  } else if (activity.activityType == ActivityType.UPDATE_EXPENSE) {
    return <>{tr('expenseUpdated')}</>
  } else if (activity.activityType == ActivityType.DELETE_EXPENSE) {
    return <>{tr('expenseDeleted')}</>
  } else if (
    activity.activityType == ActivityType.SETTLE_EXPENSE ||
    activity.activityType == ActivityType.UNSETTLE_EXPENSE
  ) {
    // data: {"title": expense title, "names": participants} (see api.ts)
    let settle = { title: '', names: [] as string[] }
    try {
      settle = JSON.parse(activity.data ?? '') as typeof settle
    } catch {}
    return (
      <>
        {t.rich(
          activity.activityType == ActivityType.SETTLE_EXPENSE
            ? 'expenseSettled'
            : 'expenseUnsettled',
          {
            expense: settle.title,
            names: settle.names.join(', '),
            participant,
            em: (chunks) => <em>&ldquo;{chunks}&rdquo;</em>,
            strong: (chunks) => <strong>{chunks}</strong>,
          },
        )}
      </>
    )
  }
}

export function ActivityItem({
  groupId,
  activity,
  participant,
  dateStyle,
}: Props) {
  const router = useRouter()
  const drawer = useExpenseDrawerOptional()
  const locale = useLocale()

  const expenseExists = activity.expense !== undefined
  const summary = useSummary(activity, participant?.name)

  return (
    <div
      className={cn(
        'flex justify-between sm:rounded-lg px-2 sm:pr-1 sm:pl-2 py-2 text-sm hover:bg-accent gap-1 items-stretch',
        expenseExists && 'cursor-pointer',
      )}
      onClick={() => {
        if (expenseExists) {
          if (drawer && activity.expenseId) drawer.openExpense(activity.expenseId)
          else router.push(`/groups/${groupId}/expenses/${activity.expenseId}/edit`)
        }
      }}
    >
      <div className="flex flex-col justify-between items-start">
        {dateStyle !== undefined && (
          <div className="mt-1 text-xs/5 text-muted-foreground">
            {formatDate(activity.time, locale, { dateStyle })}
          </div>
        )}
        <div className="my-1 text-xs/5 text-muted-foreground">
          {formatDate(activity.time, locale, { timeStyle: 'short' })}
        </div>
      </div>
      <div className="flex-1">
        <div className="m-1">{summary}</div>
      </div>
      {expenseExists && (
        <Button
          size="icon"
          variant="link"
          className="self-center hidden sm:flex w-5 h-5"
          asChild
        >
          <Link href={`/groups/${groupId}/expenses/${activity.expenseId}/edit`}>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </Button>
      )}
    </div>
  )
}
