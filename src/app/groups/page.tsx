import { RecentGroupList } from '@/app/groups/recent-group-list'
import { GlobalSettings } from '@/components/global-settings'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Recently visited groups',
}

export default async function GroupsPage() {
  return (
    <div className="space-y-8">
      <RecentGroupList />
      <GlobalSettings />
    </div>
  )
}
