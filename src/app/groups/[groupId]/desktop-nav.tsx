'use client'

import { useExpenseDrawerOptional } from '@/app/groups/[groupId]/expenses/expense-drawer-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ArrowLeftRight,
  BarChart3,
  History,
  Plus,
  Receipt,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function DesktopNav({ groupId }: { groupId: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const drawerCtx = useExpenseDrawerOptional()

  const currentTab =
    pathname.match(/\/groups\/[^/]+\/([^/]+)/)?.[1] || 'expenses'

  const items = [
    {
      key: 'expenses',
      label: t('Expenses.title'),
      icon: Receipt,
      href: `/groups/${groupId}/expenses`,
    },
    {
      key: 'balances',
      label: t('Balances.title'),
      icon: ArrowLeftRight,
      href: `/groups/${groupId}/balances`,
    },
    {
      key: 'stats',
      label: t('Stats.title'),
      icon: BarChart3,
      href: `/groups/${groupId}/stats`,
    },
    {
      key: 'activity',
      label: t('Activity.title'),
      icon: History,
      href: `/groups/${groupId}/activity`,
    },
  ]

  const handleCreate = () => {
    if (drawerCtx) {
      drawerCtx.openCreateExpense()
    }
  }

  return (
    <nav className="hidden md:flex fixed top-14 left-0 right-0 z-40 h-12 items-center justify-between bg-white/80 dark:bg-gray-950/80 px-4 border-b backdrop-blur-md">
      <div className="flex items-center gap-1">
        {items.map((item) => {
          const isActive =
            item.key === 'expenses'
              ? currentTab === 'expenses' || currentTab === ''
              : currentTab === item.key

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
      <div>
        {drawerCtx ? (
          <Button
            size="sm"
            onClick={handleCreate}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('Expenses.create')}</span>
          </Button>
        ) : (
          <Button size="sm" asChild className="gap-1.5">
            <Link href={`/groups/${groupId}/expenses/create`}>
              <Plus className="w-4 h-4" />
              <span>{t('Expenses.create')}</span>
            </Link>
          </Button>
        )}
      </div>
    </nav>
  )
}
