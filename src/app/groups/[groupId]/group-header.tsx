'use client'

import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Settings } from 'lucide-react'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()

  return (
    <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between bg-white dark:bg-gray-950 bg-opacity-80 dark:bg-opacity-80 px-4 border-b backdrop-blur-md z-50">
      <h1 className="font-bold text-lg flex-1 min-w-0">
        <Link href={`/groups/${groupId}`}>
          {isLoading ? (
            <Skeleton className="h-5 w-32" />
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
        <ThemeToggle />
      </div>
    </header>
  )
}
