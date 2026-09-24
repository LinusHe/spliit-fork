'use client'

import { ShareButton } from '@/app/groups/[groupId]/share-button'
import { OfflineBadge } from '@/components/offline-status'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight, Home, Settings } from 'lucide-react'
import Link from 'next/link'
import { useCurrentGroup } from './current-group-context'

export const GroupHeader = () => {
  const { isLoading, groupId, group } = useCurrentGroup()

  return (
    <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between bg-white dark:bg-gray-950 bg-opacity-80 dark:bg-opacity-80 px-3 border-b backdrop-blur-md z-50">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Link
          href="/groups"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <Home className="w-5 h-5" />
        </Link>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        <Link
          href={`/groups/${groupId}`}
          className="font-semibold text-base truncate"
        >
          {isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            group.name
          )}
        </Link>
      </div>

      {/* Right: Actions */}
      <div className="flex gap-0.5 items-center shrink-0">
        <OfflineBadge />
        {group && <ShareButton group={group} />}
        <Button variant="ghost" size="icon" asChild className="h-9 w-9">
          <Link href={`/groups/${groupId}/edit`}>
            <Settings className="w-[18px] h-[18px]" />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
