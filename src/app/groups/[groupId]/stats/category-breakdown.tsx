'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useLocale } from 'next-intl'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useCurrentGroup } from '../current-group-context'

const COLORS = [
  '#059669', // emerald-600
  '#0891b2', // cyan-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#ea580c', // orange-600
  '#2563eb', // blue-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#4f46e5', // indigo-600
  '#65a30d', // lime-600
  '#0d9488', // teal-600
  '#9333ea', // purple-600
]

function formatAmount(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      name: string
      value: number
      percentage: number
    }
  }>
  currency: string
  locale: string
}

function CustomTooltip({ active, payload, currency, locale }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md text-sm">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground">
        {formatAmount(data.value, currency, locale)} ({data.percentage.toFixed(1)}%)
      </p>
    </div>
  )
}

export function CategoryBreakdown() {
  const { groupId, group } = useCurrentGroup()
  const locale = useLocale()
  const { data, isLoading } = trpc.groups.stats.categoryBreakdown.useQuery({
    groupId,
  })

  if (isLoading || !data || !group) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-48 w-48 mx-auto rounded-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  const currency = getCurrencyFromGroup(group)
  const currencyCode = group.currencyCode || currency.code || 'EUR'

  const chartData = data.categories.map((cat) => ({
    name: cat.name,
    value: Math.abs(cat.total),
    percentage: data.grandTotal ? (Math.abs(cat.total) / Math.abs(data.grandTotal)) * 100 : 0,
    grouping: cat.grouping,
    id: cat.id,
  }))

  if (chartData.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-8">
        No expenses yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Donut Chart */}
      <div className="mx-auto" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              content={
                <CustomTooltip currency={currencyCode} locale={locale} />
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category List */}
      <div className="flex flex-col gap-2">
        {chartData.map((cat, index) => (
          <div key={cat.id} className="flex items-center gap-3">
            {/* Color dot + Icon */}
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <CategoryIcon
              category={{ id: cat.id, grouping: cat.grouping, name: cat.name } as any}
              className="w-4 h-4 text-muted-foreground shrink-0"
            />

            {/* Name + Bar */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium truncate">{cat.name}</span>
                <span className="text-sm text-muted-foreground ml-2 shrink-0">
                  {formatAmount(cat.value, currencyCode, locale)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${cat.percentage}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
              </div>
            </div>

            {/* Percentage */}
            <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
              {cat.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
