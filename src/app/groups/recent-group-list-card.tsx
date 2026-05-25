import {
  RecentGroup,
  archiveGroup,
  deleteRecentGroup,
  starGroup,
  unarchiveGroup,
  unstarGroup,
} from '@/app/groups/recent-groups-helpers'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { useActiveUser } from '@/lib/hooks'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { StarFilledIcon } from '@radix-ui/react-icons'
import {
  Calendar,
  CircleCheck,
  MoreHorizontal,
  Star,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function RecentGroupListCard({
  group,
  groupDetail,
  isStarred,
  isArchived,
  refreshGroupsFromStorage,
}: {
  group: RecentGroup
  groupDetail?: AppRouterOutput['groups']['list']['groups'][number]
  isStarred: boolean
  isArchived: boolean
  refreshGroupsFromStorage: () => void
}) {
  const router = useRouter()
  const locale = useLocale()
  const toast = useToast()
  const t = useTranslations('Groups')
  const activeUser = useActiveUser(group.id)
  const balance =
    activeUser && activeUser !== 'None'
      ? groupDetail?.balances[activeUser]?.total
      : undefined

  return (
    <li key={group.id}>
      <Button
        variant="secondary"
        className="h-fit w-full py-3 rounded-lg border bg-card shadow-sm"
        asChild
      >
        <div
          className="text-base"
          onClick={() => router.push(`/groups/${group.id}`)}
        >
          <div className="w-full flex flex-col gap-1">
            <div className="text-base flex gap-2 justify-between">
              <Link
                href={`/groups/${group.id}`}
                className="flex-1 overflow-hidden text-ellipsis"
              >
                {group.name}
              </Link>
              <span className="flex-shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="-my-3 -ml-3 -mr-1.5"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (isStarred) {
                      unstarGroup(group.id)
                    } else {
                      starGroup(group.id)
                      unarchiveGroup(group.id)
                    }
                    refreshGroupsFromStorage()
                  }}
                >
                  {isStarred ? (
                    <StarFilledIcon className="w-4 h-4 text-orange-400" />
                  ) : (
                    <Star className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="-my-3 -mr-3 -ml-1.5"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteRecentGroup(group)
                        refreshGroupsFromStorage()

                        toast.toast({
                          title: t('RecentRemovedToast.title'),
                          description: t('RecentRemovedToast.description'),
                        })
                      }}
                    >
                      {t('removeRecent')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isArchived) {
                          unarchiveGroup(group.id)
                        } else {
                          archiveGroup(group.id)
                          unstarGroup(group.id)
                        }
                        refreshGroupsFromStorage()
                      }}
                    >
                      {t(isArchived ? 'unarchive' : 'archive')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
            <div className="text-muted-foreground font-normal text-xs">
              {groupDetail ? (
                <div className="flex w-full flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Users className="w-3 h-3 inline mr-1" />
                      <span>{groupDetail._count.participants}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 inline mx-1" />
                      <span>
                        {new Date(groupDetail.createdAt).toLocaleDateString(
                          locale,
                          {
                            dateStyle: 'medium',
                          },
                        )}
                      </span>
                    </div>
                  </div>
                  <GroupBalanceStatus
                    balance={balance}
                    groupDetail={groupDetail}
                    locale={locale}
                  />
                </div>
              ) : (
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-6 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Button>
    </li>
  )
}

function GroupBalanceStatus({
  balance,
  groupDetail,
  locale,
}: {
  balance?: number
  groupDetail: AppRouterOutput['groups']['list']['groups'][number]
  locale: string
}) {
  const t = useTranslations('Groups.BalanceStatus')

  if (balance === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <UserRound className="h-3 w-3" />
        {t('noActiveUser')}
      </span>
    )
  }

  const currency = getCurrencyFromGroup(groupDetail)
  const amount = formatCurrency(currency, Math.abs(balance), locale)
  const status =
    balance === 0
      ? {
          icon: CircleCheck,
          label: t('settled'),
          className: 'text-emerald-600 dark:text-emerald-400',
        }
      : balance > 0
      ? {
          icon: TrendingUp,
          label: t('getsBack', { amount }),
          className: 'text-emerald-600 dark:text-emerald-400',
        }
      : {
          icon: TrendingDown,
          label: t('owes', { amount }),
          className: 'text-amber-700 dark:text-amber-400',
        }
  const Icon = status.icon

  return (
    <span className={cn('inline-flex items-center gap-1', status.className)}>
      <Icon className="h-3 w-3" />
      {status.label}
    </span>
  )
}
