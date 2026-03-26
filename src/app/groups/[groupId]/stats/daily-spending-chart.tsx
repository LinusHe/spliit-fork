'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActiveUser } from '@/lib/hooks'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import dayjs from 'dayjs'
import 'dayjs/locale/de'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useRef } from 'react'
import { useCurrentGroup } from '../current-group-context'

const COLOR_SCALE = [
  'hsl(142, 71%, 45%)',
  'hsl(80, 60%, 50%)',
  'hsl(48, 89%, 50%)',
  'hsl(36, 90%, 50%)',
  'hsl(0, 72%, 51%)',
]

function getBarColor(amount: number, max: number): string {
  if (max === 0) return COLOR_SCALE[0]
  const ratio = Math.min(amount / max, 1)
  const index = Math.min(
    Math.floor(ratio * (COLOR_SCALE.length - 1)),
    COLOR_SCALE.length - 1,
  )
  const upperIdx = Math.min(index + 1, COLOR_SCALE.length - 1)
  const localRatio = ratio * (COLOR_SCALE.length - 1) - index
  return localRatio > 0.5 ? COLOR_SCALE[upperIdx] : COLOR_SCALE[index]
}

function formatDateLabel(date: string, locale: string): string {
  const d = dayjs(date).locale(locale)
  return d.format('dd, D. MMM')
}

function DailyBars({
  groupId,
  participantId,
}: {
  groupId: string
  participantId?: string
}) {
  const locale = useLocale()
  const t = useTranslations('Stats')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { group } = useCurrentGroup()

  const { data, isLoading } = trpc.groups.stats.dailySpending.useQuery({
    groupId,
    participantId,
  })

  const currency = group ? getCurrencyFromGroup(group) : undefined

  const { days, maxAmount, avgAmount } = useMemo(() => {
    if (!data?.days) return { days: [], maxAmount: 0, avgAmount: 0 }
    const max = Math.max(...data.days.map((d) => d.total), 0)
    const avg =
      data.days.length > 0
        ? data.days.reduce((s, d) => s + d.total, 0) / data.days.length
        : 0
    return { days: data.days, maxAmount: max, avgAmount: avg }
  }, [data])

  if (isLoading || !group) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 rounded" />
        ))}
      </div>
    )
  }

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('DailySpending.empty')}
      </p>
    )
  }

  const BAR_HEIGHT = 36
  const GAP = 4

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {days.length} {t('DailySpending.days')}
        </span>
        <span>
          ⌀{' '}
          {currency
            ? formatCurrency(currency, avgAmount, locale)
            : (avgAmount / 100).toFixed(2)}{' '}
          / {t('DailySpending.day')}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-lg border bg-card"
        style={{ maxHeight: 400 }}
      >
        <div
          className="relative w-full"
          style={{
            height: days.length * (BAR_HEIGHT + GAP) + GAP,
            minHeight: 100,
          }}
        >
          {days.map((day, i) => {
            const widthPct =
              maxAmount > 0
                ? Math.max((day.total / maxAmount) * 100, 2)
                : 2
            const color = getBarColor(day.total, maxAmount)
            const amountStr = currency
              ? formatCurrency(currency, day.total, locale)
              : (day.total / 100).toFixed(2)
            const label = formatDateLabel(day.date, locale)
            const top = i * (BAR_HEIGHT + GAP) + GAP

            return (
              <div
                key={day.date}
                className="absolute left-0 right-0 flex items-center gap-2 px-3"
                style={{ top, height: BAR_HEIGHT }}
              >
                <span className="shrink-0 w-[100px] text-xs text-muted-foreground tabular-nums">
                  {label}
                </span>
                <div className="relative flex-1 h-6 rounded-md bg-muted/30 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  />
                  {maxAmount > 0 && (
                    <div
                      className="absolute inset-y-0 w-px bg-foreground/20"
                      style={{
                        left: `${(avgAmount / maxAmount) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <span className="shrink-0 min-w-[60px] text-right text-xs font-medium tabular-nums">
                  {amountStr}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-1.5">
          <div
            className="w-8 h-2 rounded-full"
            style={{
              background: `linear-gradient(to right, ${COLOR_SCALE[0]}, ${COLOR_SCALE[2]}, ${COLOR_SCALE[4]})`,
            }}
          />
          <span>{t('DailySpending.lowToHigh')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 border-l border-foreground/20" />
          <span>{t('DailySpending.average')}</span>
        </div>
      </div>
    </div>
  )
}

export function DailySpendingChart() {
  const { groupId } = useCurrentGroup()
  const activeUser = useActiveUser(groupId)
  const t = useTranslations('Stats')

  const participantId =
    activeUser && activeUser !== 'None' ? activeUser : undefined

  return (
    <Tabs defaultValue="group">
      <TabsList className="w-full">
        <TabsTrigger value="group" className="flex-1">
          {t('Categories.group')}
        </TabsTrigger>
        <TabsTrigger
          value="mine"
          className="flex-1"
          disabled={!participantId}
        >
          {t('Categories.mine')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="group" className="mt-4">
        <DailyBars groupId={groupId} />
      </TabsContent>

      <TabsContent value="mine" className="mt-4">
        {participantId && (
          <DailyBars groupId={groupId} participantId={participantId} />
        )}
      </TabsContent>
    </Tabs>
  )
}
