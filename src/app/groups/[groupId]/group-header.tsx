'use client'

import { GroupTabs } from '@/app/groups/[groupId]/group-tabs'
import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { NotificationBell } from '@/components/notification-bell'
import { Skeleton } from '@/components/ui/skeleton'
import { useActiveUser } from '@/lib/hooks'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)

  return (
    <div className="flex flex-col justify-between gap-3">
      <h1 className="font-bold text-2xl">
        <Link href={`/groups/${groupId}`}>
          {isLoading ? (
            <Skeleton className="mt-1.5 mb-1.5 h-5 w-32" />
          ) : (
            <div className="flex">{group.name}</div>
          )}
        </Link>
      </h1>

      <div className="flex gap-2 justify-between">
        <GroupTabs groupId={groupId} />
        <div className="flex gap-1 items-center">
          <NotificationBell groupId={groupId} participantId={activeUser} />
          {group && <ShareButton group={group} />}
        </div>
      </div>
    </div>
  )
}
