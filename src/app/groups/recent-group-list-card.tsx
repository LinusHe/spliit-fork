import {
  RecentGroup,
  archiveGroup,
  deleteRecentGroup,
  starGroup,
  unarchiveGroup,
  unstarGroup,
} from '@/app/groups/recent-groups-helpers'
import { useOfflineStatus } from '@/components/offline-status'
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
import { isOffline } from '@/lib/offline/engine'
import { cn, formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { StarFilledIcon } from '@radix-ui/react-icons'
import {
  Calendar,
  CircleCheck,
  CloudOff,
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
  const { offline } = useOfflineStatus()
  // Offline, the list only knows groups that have a copy on this device.
  const unavailable = offline && !groupDetail
  const balance =
    activeUser && activeUser !== 'None'
      ? groupDetail?.balances[activeUser]?.total ?? 0
      : undefined
  const isSettled = groupDetail
    ? Object.keys(groupDetail.balances).length === 0
    : false

  return (
    <li key={group.id}>
      <Button
        variant="secondary"
        className={cn(
          'h-fit w-full py-3 rounded-lg border bg-card shadow-sm',
          unavailable && 'opacity-60',
        )}
        asChild
      >
        <div
          data-testid="recent-group-card"
          className="text-base"
          onClick={() => {
            const href = `/groups/${group.id}`
            if (unavailable)
              toast.toast({
                title: 'Offline nicht verfügbar',
                description:
                  'Diese Gruppe wurde auf diesem Gerät noch nicht gespeichert. Öffne sie einmal mit Internet, dann klappt es auch offline.',
              })
            else if (isOffline()) location.assign(href)
            else router.push(href)
          }}
        >
          <div className="w-full flex flex-col gap-1">
            <div className="text-base flex gap-2 justify-between">
              {unavailable ? (
                <span className="flex-1 overflow-hidden text-ellipsis">
                  {group.name}
                </span>
              ) : (
                <Link
                  href={`/groups/${group.id}`}
                  className="flex-1 overflow-hidden text-ellipsis"
                >
                  {group.name}
                </Link>
              )}
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
                    isSettled={isSettled}
                    locale={locale}
                  />
                </div>
              ) : unavailable ? (
                <span className="inline-flex items-center gap-1">
                  <CloudOff className="h-3 w-3" />
                  Offline nicht verfügbar
                </span>
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
  isSettled,
  locale,
}: {
  balance?: number
  groupDetail: AppRouterOutput['groups']['list']['groups'][number]
  isSettled: boolean
  locale: string
}) {
  const t = useTranslations('Groups.BalanceStatus')

  if (balance === undefined && !isSettled) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <UserRound className="h-3 w-3" />
        {t('noActiveUser')}
      </span>
    )
  }

  const currency = getCurrencyFromGroup(groupDetail)
  const effectiveBalance = balance ?? 0
  const amount = formatCurrency(currency, Math.abs(effectiveBalance), locale)
  const status =
    isSettled || effectiveBalance === 0
      ? {
          icon: CircleCheck,
          label: t('settled'),
          className: 'text-emerald-600 dark:text-emerald-400',
        }
      : effectiveBalance > 0
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
