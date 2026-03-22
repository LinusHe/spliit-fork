'use client'

import { useToast } from '@/components/ui/use-toast'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { trpc } from '@/trpc/client'
import { useTranslations } from 'next-intl'
import { PropsWithChildren, useEffect } from 'react'
import { BottomNav } from './bottom-nav'
import { CurrentGroupProvider } from './current-group-context'
import { ExpenseDrawerProvider } from './expenses/expense-drawer-context'
import { ExpenseDrawer } from './expenses/expense-drawer'
import { GroupHeader } from './group-header'
import { NotificationPrompt } from './notification-prompt'
import { SaveGroupLocally } from './save-recent-group'

export function GroupLayoutClient({
  groupId,
  runtimeFeatureFlags,
  children,
}: PropsWithChildren<{
  groupId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}>) {
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
        <ExpenseDrawerProvider>
          <GroupHeader />
          {children}
        </ExpenseDrawerProvider>
      </CurrentGroupProvider>
    )
  }

  return (
    <CurrentGroupProvider {...props}>
      <ExpenseDrawerProvider>
        <GroupHeader />
        {children}
        {/* Bottom padding for the floating nav */}
        <div className="h-24" />
        <BottomNav groupId={groupId} />
        <NotificationPrompt groupId={groupId} />
        <SaveGroupLocally />
        <ExpenseDrawer runtimeFeatureFlags={runtimeFeatureFlags} />
      </ExpenseDrawerProvider>
    </CurrentGroupProvider>
  )
}
