'use client'

import GroupInformation from '@/app/groups/[groupId]/information/group-information'
import { GlobalSettings } from '@/components/global-settings'
import { GroupForm } from '@/components/group-form'
import { NotificationSettings } from '@/components/notification-settings'
import { trpc } from '@/trpc/client'
import { useCurrentGroup } from '../current-group-context'
import { useOfflineStatus } from '@/components/offline-status'
import { refreshSnapshot } from '@/lib/offline/engine'

export const EditGroup = () => {
  const offline = useOfflineStatus()
  const { groupId } = useCurrentGroup()
  const { data, isLoading } = trpc.groups.getDetails.useQuery({ groupId })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()

  if (isLoading) return <></>
  if (offline.offline || offline.pending) return <p className="text-sm text-muted-foreground">Gruppeneinstellungen sind nach dem Online-Abgleich wieder verfügbar. Ausgaben kannst du weiterhin offline bearbeiten.</p>

  return (
    <>
      <GroupForm
        group={data?.group}
        onSubmit={async (groupFormValues, participantId) => {
          await mutateAsync({ groupId, participantId, groupFormValues })
          await refreshSnapshot(groupId)
          await utils.groups.invalidate()
        }}
        protectedParticipantIds={data?.participantsWithExpenses}
      />
      <GroupInformation groupId={groupId} />
      <NotificationSettings groupId={groupId} />
      <GlobalSettings />
    </>
  )
}
