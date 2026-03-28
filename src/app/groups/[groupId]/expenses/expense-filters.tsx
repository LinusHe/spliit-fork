'use client'

import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { trpc } from '@/trpc/client'
import { MapPin, SlidersHorizontal, Tag, Users, X, Wallet } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

export interface ExpenseFilters {
  categoryGrouping?: string
  locationName?: string
  minAmount?: number
  maxAmount?: number
  participantId?: string
}

interface Props {
  filters: ExpenseFilters
  onChange: (filters: ExpenseFilters) => void
}

export function ExpenseFilterDrawer({ filters, onChange }: Props) {
  const { groupId, group } = useCurrentGroup()
  const t = useTranslations('Expenses')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ExpenseFilters>(filters)

  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const { data: categoriesData } = trpc.categories.list.useQuery()

  // Group categories by grouping name
  const categoryGroups = useMemo(() => {
    if (!categoriesData?.categories) return []
    const seen = new Set<string>()
    const groups: string[] = []
    for (const cat of categoriesData.categories) {
      if (!seen.has(cat.grouping)) {
        seen.add(cat.grouping)
        groups.push(cat.grouping)
      }
    }
    return groups
  }, [categoriesData])

  // Get unique locations from expenses
  const { data: allExpenses } = trpc.groups.expenses.list.useInfiniteQuery(
    { groupId, limit: 500 },
    { getNextPageParam: ({ nextCursor }) => nextCursor },
  )

  const locations = useMemo(() => {
    if (!allExpenses) return []
    const locs = new Set<string>()
    for (const page of allExpenses.pages) {
      for (const exp of page.expenses) {
        if (exp.locationName) locs.add(exp.locationName)
      }
    }
    return Array.from(locs).sort()
  }, [allExpenses])

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined,
  ).length

  const apply = () => {
    onChange(draft)
    setOpen(false)
  }

  const clear = () => {
    const empty: ExpenseFilters = {}
    setDraft(empty)
    onChange(empty)
    setOpen(false)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 relative h-10"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] overflow-hidden">
        <DrawerTitle className="sr-only">{t('filters')}</DrawerTitle>
        <div className="overflow-y-auto overscroll-contain px-4 pb-8 pt-2">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold">{t('filters')}</h3>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon">
                <X className="w-4 h-4" />
              </Button>
            </DrawerClose>
          </div>

          <div className="space-y-6">
            {/* Category filter — grouped */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">
                  {t('filterCategory')}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    draft.categoryGrouping === undefined
                      ? 'default'
                      : 'outline'
                  }
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({ ...d, categoryGrouping: undefined }))
                  }
                >
                  {t('filterAll')}
                </Button>
                {categoryGroups.map((grouping) => (
                  <Button
                    key={grouping}
                    type="button"
                    variant={
                      draft.categoryGrouping === grouping
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        categoryGrouping:
                          d.categoryGrouping === grouping
                            ? undefined
                            : grouping,
                      }))
                    }
                  >
                    {grouping}
                  </Button>
                ))}
              </div>
            </div>

            {/* Location filter */}
            {locations.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <label className="text-sm font-medium">
                    {t('filterLocation')}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={
                      draft.locationName === undefined ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() =>
                      setDraft((d) => ({ ...d, locationName: undefined }))
                    }
                  >
                    {t('filterAll')}
                  </Button>
                  {locations.map((loc) => (
                    <Button
                      key={loc}
                      type="button"
                      variant={
                        draft.locationName === loc ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          locationName:
                            d.locationName === loc ? undefined : loc,
                        }))
                      }
                    >
                      {loc}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Amount range */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">
                  {t('filterAmount')}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Min"
                  className="text-base"
                  value={
                    draft.minAmount !== undefined ? draft.minAmount / 100 : ''
                  }
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      minAmount: e.target.value
                        ? Math.round(Number(e.target.value) * 100)
                        : undefined,
                    }))
                  }
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Max"
                  className="text-base"
                  value={
                    draft.maxAmount !== undefined ? draft.maxAmount / 100 : ''
                  }
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      maxAmount: e.target.value
                        ? Math.round(Number(e.target.value) * 100)
                        : undefined,
                    }))
                  }
                />
              </div>
            </div>

            {/* Participant filter */}
            {group && group.participants.length > 1 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <label className="text-sm font-medium">
                    {t('filterParticipant')}
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={
                      draft.participantId === undefined
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    onClick={() =>
                      setDraft((d) => ({ ...d, participantId: undefined }))
                    }
                  >
                    {t('filterAll')}
                  </Button>
                  {group.participants.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant={
                        draft.participantId === p.id ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          participantId:
                            d.participantId === p.id ? undefined : p.id,
                        }))
                      }
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-6">
            <Button className="flex-1" onClick={apply}>
              {t('filterApply')}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={clear}>
                {t('filterClear')}
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
