'use client'

import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-bold text-2xl flex-1 min-w-0">
        <Link href={`/groups/${groupId}`}>
          {isLoading ? (
            <Skeleton className="mt-1.5 mb-1.5 h-5 w-32" />
          ) : (
            <span className="truncate block">{group.name}</span>
          )}
        </Link>
      </h1>

      <div className="flex gap-1 items-center shrink-0">
        {group && <ShareButton group={group} />}
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/groups/${groupId}/edit`}>
            <Settings className="w-5 h-5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
