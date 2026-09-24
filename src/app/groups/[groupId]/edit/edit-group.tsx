'use client'

import GroupInformation from '@/app/groups/[groupId]/information/group-information'
import { GlobalSettings } from '@/components/global-settings'
import { GroupForm } from '@/components/group-form'
import { GroupOfflineSettings } from '@/components/group-offline-settings'
import { NotificationSettings } from '@/components/notification-settings'
import { useOfflineStatus } from '@/components/offline-status'
import { refreshSnapshot } from '@/lib/offline/engine'
import { trpc } from '@/trpc/client'
import { useEffect, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

export const EditGroup = () => {
  const offline = useOfflineStatus()
  const [diagnose, setDiagnose] = useState(false)
  useEffect(() => {
    setDiagnose(new URLSearchParams(location.search).has('offline-details'))
  }, [])
  const { groupId } = useCurrentGroup()
  const { data, isLoading } = trpc.groups.getDetails.useQuery({ groupId })
  const { mutateAsync } = trpc.groups.update.useMutation()
  const utils = trpc.useUtils()

  // Offline details matter only when offline (or for diagnosis via
  // ?offline-details); online users should not see any of it.
  const details =
    offline.offline || diagnose ? (
      <GroupOfflineSettings groupId={groupId} />
    ) : null

  if (isLoading || offline.offline || offline.pending)
    return (
      <>
        {details}
        <p className="text-sm text-muted-foreground">
          Gruppeneinstellungen sind nach dem Online-Abgleich wieder verfügbar.
          Ausgaben kannst du weiterhin offline bearbeiten.
        </p>
      </>
    )

  return (
    <>
      {details}
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
