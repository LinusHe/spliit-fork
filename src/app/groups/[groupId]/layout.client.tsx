'use client'

import { useToast } from '@/components/ui/use-toast'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { PropsWithChildren, useEffect } from 'react'
import { BottomNav } from './bottom-nav'
import { CurrentGroupProvider } from './current-group-context'
import { GroupHeader } from './group-header'
import { NotificationPrompt } from './notification-prompt'
import { SaveGroupLocally } from './save-recent-group'

export function GroupLayoutClient({
  groupId,
  children,
}: PropsWithChildren<{ groupId: string }>) {
  const { data, isLoading } = trpc.groups.get.useQuery({ groupId })
  const t = useTranslations('Groups.NotFound')
  const { toast } = useToast()

  // Hide global header when inside a group (we have our own)
  useEffect(() => {
    const globalHeader = document.getElementById('global-header')
    if (globalHeader) globalHeader.style.display = 'none'
    return () => {
      if (globalHeader) globalHeader.style.display = ''
    }
  }, [])

  useEffect(() => {
    if (data && !data.group) {
      toast({
        description: t('text'),
        variant: 'destructive',
      })
    }
  }, [data])

  const props =
    isLoading || !data?.group
      ? { isLoading: true as const, groupId, group: undefined }
      : { isLoading: false as const, groupId, group: data.group }

  if (isLoading) {
    return (
      <CurrentGroupProvider {...props}>
        <GroupHeader />
        {children}
      </CurrentGroupProvider>
    )
  }

  return (
    <CurrentGroupProvider {...props}>
      <GroupHeader />
      {children}
      {/* Bottom padding for the floating nav */}
      <div className="h-24" />
      <BottomNav groupId={groupId} />
      <NotificationPrompt groupId={groupId} />
      <SaveGroupLocally />
    </CurrentGroupProvider>
  )
}
