'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
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
import { SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

export interface ExpenseFilters {
  categoryId?: number
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

  // Sync draft when filters change externally
  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

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
    <Drawer
      open={open}
      onOpenChange={setOpen}
      shouldScaleBackground={false}
    >
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 relative"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('filters')}</span>
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
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">{t('filters')}</h3>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon">
                <X className="w-4 h-4" />
              </Button>
            </DrawerClose>
          </div>

          <div className="space-y-5">
            {/* Category filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('filterCategory')}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    draft.categoryId === undefined ? 'default' : 'outline'
                  }
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({ ...d, categoryId: undefined }))
                  }
                >
                  {t('filterAll')}
                </Button>
                {categories?.map((cat) => (
                  <Button
                    key={cat.id}
                    type="button"
                    variant={
                      draft.categoryId === cat.id ? 'default' : 'outline'
                    }
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        categoryId:
                          d.categoryId === cat.id ? undefined : cat.id,
                      }))
                    }
                  >
                    <CategoryIcon
                      category={cat}
                      className="w-3.5 h-3.5"
                    />
                    {cat.grouping}
                  </Button>
                ))}
              </div>
            </div>

            {/* Location filter */}
            {locations.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t('filterLocation')}
                </label>
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
              <label className="text-sm font-medium mb-2 block">
                {t('filterAmount')}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  className="text-base"
                  value={
                    draft.minAmount !== undefined
                      ? draft.minAmount / 100
                      : ''
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
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder="Max"
                  className="text-base"
                  value={
                    draft.maxAmount !== undefined
                      ? draft.maxAmount / 100
                      : ''
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
                <label className="text-sm font-medium mb-2 block">
                  {t('filterParticipant')}
                </label>
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
            <Button
              variant="outline"
              onClick={clear}
              disabled={activeFilterCount === 0}
            >
              {t('filterClear')}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
