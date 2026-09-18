'use client'

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
import { useExpenseDrawerOptional } from './expenses/expense-drawer-context'

export function BottomNav({ groupId }: { groupId: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const drawer = useExpenseDrawerOptional()

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
      key: 'create',
      label: '',
      icon: Plus,
      href: `/groups/${groupId}/expenses/create`,
      isCenter: true,
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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto max-w-md px-4 pb-3">
        <div className="flex items-center justify-around rounded-2xl border bg-background/95 backdrop-blur-md shadow-lg px-2 py-1.5">
          {items.map((item) => {
            const isActive =
              !item.isCenter &&
              (item.key === 'expenses'
                ? currentTab === 'expenses' || currentTab === ''
                : currentTab === item.key)

            if (item.isCenter) {
              if (drawer) return <button key={item.key} type="button" aria-label="Ausgabe hinzufügen" onClick={() => drawer.openCreateExpense()} className="flex items-center justify-center -mt-5 rounded-full bg-primary text-primary-foreground w-12 h-12 shadow-lg hover:scale-105 active:scale-95 transition-transform"><item.icon className="w-6 h-6" strokeWidth={2.5} /></button>
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-center -mt-5 rounded-full bg-primary text-primary-foreground w-12 h-12 shadow-lg hover:scale-105 active:scale-95 transition-transform"
                >
                  <item.icon className="w-6 h-6" strokeWidth={2.5} />
                </Link>
              )
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[3.5rem]',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon
                  className="w-5 h-5"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="text-[10px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
