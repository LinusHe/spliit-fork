'use client'
import { AddGroupByUrlButton } from '@/app/groups/add-group-by-url-button'
import {
  RecentGroups,
  getArchivedGroups,
  getRecentGroups,
  getStarredGroups,
} from '@/app/groups/recent-groups-helpers'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getGroups } from '@/lib/api'
import { trpc } from '@/trpc/client'
import { AppRouterOutput } from '@/trpc/routers/_app'
import { Loader2, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PropsWithChildren, useEffect, useState } from 'react'
import { RecentGroupListCard } from './recent-group-list-card'

type GroupDetail = AppRouterOutput['groups']['list']['groups'][number]
type SortMode = 'recent' | 'name' | 'balance'

export type RecentGroupsState =
  | { status: 'pending' }
  | {
      status: 'partial'
      groups: RecentGroups
      starredGroups: string[]
      archivedGroups: string[]
    }
  | {
      status: 'complete'
      groups: RecentGroups
      groupsDetails: Awaited<ReturnType<typeof getGroups>>
      starredGroups: string[]
      archivedGroups: string[]
    }

function sortGroups({
  groups,
  starredGroups,
  archivedGroups,
}: {
  groups: RecentGroups
  starredGroups: string[]
  archivedGroups: string[]
}) {
  const starredGroupInfo = []
  const groupInfo = []
  const archivedGroupInfo = []
  for (const group of groups) {
    if (starredGroups.includes(group.id)) {
      starredGroupInfo.push(group)
    } else if (archivedGroups.includes(group.id)) {
      archivedGroupInfo.push(group)
    } else {
      groupInfo.push(group)
    }
  }
  return {
    starredGroupInfo,
    groupInfo,
    archivedGroupInfo,
  }
}

export function RecentGroupList() {
  const [state, setState] = useState<RecentGroupsState>({ status: 'pending' })

  function loadGroups() {
    const groupsInStorage = getRecentGroups()
    const starredGroups = getStarredGroups()
    const archivedGroups = getArchivedGroups()
    setState({
      status: 'partial',
      groups: groupsInStorage,
      starredGroups,
      archivedGroups,
    })
  }

  useEffect(() => {
    loadGroups()
  }, [])

  if (state.status === 'pending') return null

  return (
    <RecentGroupList_
      groups={state.groups}
      starredGroups={state.starredGroups}
      archivedGroups={state.archivedGroups}
      refreshGroupsFromStorage={() => loadGroups()}
    />
  )
}

function RecentGroupList_({
  groups,
  starredGroups,
  archivedGroups,
  refreshGroupsFromStorage,
}: {
  groups: RecentGroups
  starredGroups: string[]
  archivedGroups: string[]
  refreshGroupsFromStorage: () => void
}) {
  const t = useTranslations('Groups')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [hideSettled, setHideSettled] = useState(false)
  const { data, isLoading } = trpc.groups.list.useQuery({
    groupIds: groups.map((group) => group.id),
  })

  if (isLoading || !data) {
    return (
      <GroupsPage reload={refreshGroupsFromStorage}>
        <p>
          <Loader2 className="w-4 m-4 mr-2 inline animate-spin" />{' '}
          {t('loadingRecent')}
        </p>
      </GroupsPage>
    )
  }

  if (data.groups.length === 0) {
    return (
      <GroupsPage reload={refreshGroupsFromStorage}>
        <div className="text-sm space-y-2">
          <p>{t('NoRecent.description')}</p>
          <p>
            <Button variant="link" asChild className="-m-4">
              <Link href={`/groups/create`}>{t('NoRecent.create')}</Link>
            </Button>{' '}
            {t('NoRecent.orAsk')}
          </p>
        </div>
      </GroupsPage>
    )
  }

  const activeUsers = getActiveUsers(groups)
  const visibleGroups = filterAndSortGroups({
    groups,
    groupDetails: data.groups,
    activeUsers,
    query,
    sortMode,
    hideSettled,
  })
  const { starredGroupInfo, groupInfo, archivedGroupInfo } = sortGroups({
    groups: visibleGroups,
    starredGroups,
    archivedGroups,
  })

  return (
    <GroupsPage reload={refreshGroupsFromStorage}>
      <GroupFilters
        query={query}
        sortMode={sortMode}
        hideSettled={hideSettled}
        setQuery={setQuery}
        setSortMode={setSortMode}
        setHideSettled={setHideSettled}
      />
      {visibleGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('Filters.noResults')}
        </p>
      )}
      {starredGroupInfo.length > 0 && (
        <>
          <h2 className="mb-2">{t('starred')}</h2>
          <GroupList
            groups={starredGroupInfo}
            groupDetails={data.groups}
            archivedGroups={archivedGroups}
            starredGroups={starredGroups}
            refreshGroupsFromStorage={refreshGroupsFromStorage}
          />
        </>
      )}

      {groupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2">{t('recent')}</h2>
          <GroupList
            groups={groupInfo}
            groupDetails={data.groups}
            archivedGroups={archivedGroups}
            starredGroups={starredGroups}
            refreshGroupsFromStorage={refreshGroupsFromStorage}
          />
        </>
      )}

      {archivedGroupInfo.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 opacity-50">{t('archived')}</h2>
          <div className="opacity-50">
            <GroupList
              groups={archivedGroupInfo}
              groupDetails={data.groups}
              archivedGroups={archivedGroups}
              starredGroups={starredGroups}
              refreshGroupsFromStorage={refreshGroupsFromStorage}
            />
          </div>
        </>
      )}
    </GroupsPage>
  )
}

function getActiveUsers(groups: RecentGroups) {
  return Object.fromEntries(
    groups.map((group) => [
      group.id,
      localStorage.getItem(`${group.id}-activeUser`) ?? undefined,
    ]),
  )
}

function getGroupBalance(
  groupDetail: GroupDetail | undefined,
  activeUserId: string | undefined,
) {
  if (!groupDetail || !activeUserId || activeUserId === 'None') return undefined
  return groupDetail.balances[activeUserId]?.total
}

function filterAndSortGroups({
  groups,
  groupDetails,
  activeUsers,
  query,
  sortMode,
  hideSettled,
}: {
  groups: RecentGroups
  groupDetails: GroupDetail[]
  activeUsers: Record<string, string | undefined>
  query: string
  sortMode: SortMode
  hideSettled: boolean
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return groups
    .filter((group) => {
      const groupDetail = groupDetails.find((detail) => detail.id === group.id)
      const activeUserId = activeUsers[group.id]
      const balance = getGroupBalance(groupDetail, activeUserId)
      const matchesQuery = group.name
        .toLocaleLowerCase()
        .includes(normalizedQuery)
      const isSettled = balance === 0
      return matchesQuery && (!hideSettled || !isSettled)
    })
    .sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (sortMode === 'balance') {
        const aDetail = groupDetails.find((detail) => detail.id === a.id)
        const bDetail = groupDetails.find((detail) => detail.id === b.id)
        const aBalance = Math.abs(
          getGroupBalance(aDetail, activeUsers[a.id]) ?? 0,
        )
        const bBalance = Math.abs(
          getGroupBalance(bDetail, activeUsers[b.id]) ?? 0,
        )
        return bBalance - aBalance
      }
      return 0
    })
}

function GroupFilters({
  query,
  sortMode,
  hideSettled,
  setQuery,
  setSortMode,
  setHideSettled,
}: {
  query: string
  sortMode: SortMode
  hideSettled: boolean
  setQuery: (query: string) => void
  setSortMode: (sortMode: SortMode) => void
  setHideSettled: (hideSettled: boolean) => void
}) {
  const t = useTranslations('Groups.Filters')

  return (
    <div className="mt-4 mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search')}
          className="pl-9"
        />
      </div>
      <Select
        value={sortMode}
        onValueChange={(value) => setSortMode(value as SortMode)}
      >
        <SelectTrigger className="sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">{t('sortRecent')}</SelectItem>
          <SelectItem value="name">{t('sortName')}</SelectItem>
          <SelectItem value="balance">{t('sortBalance')}</SelectItem>
        </SelectContent>
      </Select>
      <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
        <Checkbox
          checked={hideSettled}
          onCheckedChange={(checked) => setHideSettled(Boolean(checked))}
        />
        {t('hideSettled')}
      </label>
    </div>
  )
}

function GroupList({
  groups,
  groupDetails,
  starredGroups,
  archivedGroups,
  refreshGroupsFromStorage,
}: {
  groups: RecentGroups
  groupDetails?: AppRouterOutput['groups']['list']['groups']
  starredGroups: string[]
  archivedGroups: string[]
  refreshGroupsFromStorage: () => void
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {groups.map((group) => (
        <RecentGroupListCard
          key={group.id}
          group={group}
          groupDetail={groupDetails?.find(
            (groupDetail) => groupDetail.id === group.id,
          )}
          isStarred={starredGroups.includes(group.id)}
          isArchived={archivedGroups.includes(group.id)}
          refreshGroupsFromStorage={refreshGroupsFromStorage}
        />
      ))}
    </ul>
  )
}

function GroupsPage({
  children,
  reload,
}: PropsWithChildren<{ reload: () => void }>) {
  const t = useTranslations('Groups')
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="font-bold text-2xl flex-1">
          <Link href="/groups">{t('myGroups')}</Link>
        </h1>
        <div className="flex gap-2">
          <AddGroupByUrlButton reload={reload} />
          <Button asChild>
            <Link href="/groups/create">
              {/* <Plus className="w-4 h-4 mr-2" /> */}
              {t('create')}
            </Link>
          </Button>
        </div>
      </div>
      <div>{children}</div>
    </>
  )
}
