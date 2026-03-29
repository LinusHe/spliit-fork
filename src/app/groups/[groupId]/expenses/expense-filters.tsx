'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { trpc } from '@/trpc/client'
import { Category } from '@prisma/client'
import {
  Calendar,
  ChevronDown,
  MapPin,
  SlidersHorizontal,
  Tag,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

export interface ExpenseFilters {
  categoryIds?: number[]
  locationName?: string
  minAmount?: number
  maxAmount?: number
  participantId?: string
  dateFrom?: string // ISO date string
  dateTo?: string // ISO date string
}

interface Props {
  filters: ExpenseFilters
  onChange: (filters: ExpenseFilters) => void
}

// Count active filters (arrays count as 1 if non-empty)
function countActiveFilters(f: ExpenseFilters): number {
  let n = 0
  if (f.categoryIds && f.categoryIds.length > 0) n++
  if (f.locationName) n++
  if (f.minAmount !== undefined) n++
  if (f.maxAmount !== undefined) n++
  if (f.participantId) n++
  if (f.dateFrom) n++
  if (f.dateTo) n++
  return n
}

export function ExpenseFilterDrawer({ filters, onChange }: Props) {
  const { groupId, group } = useCurrentGroup()
  const t = useTranslations('Expenses')
  const tCat = useTranslations('Categories')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ExpenseFilters>(filters)
  const [catPickerOpen, setCatPickerOpen] = useState(false)

  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories ?? []

  // Categories grouped
  const categoriesByGroup = useMemo(() => {
    return categories.reduce<Record<string, Category[]>>((acc, cat) => {
      acc[cat.grouping] = [...(acc[cat.grouping] ?? []), cat]
      return acc
    }, {})
  }, [categories])

  // Get unique locations
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

  // Date range defaults from expenses
  const { firstDate, lastDate } = useMemo(() => {
    if (!allExpenses) return { firstDate: '', lastDate: '' }
    let min = ''
    let max = ''
    for (const page of allExpenses.pages) {
      for (const exp of page.expenses) {
        const d = new Date(exp.expenseDate).toISOString().slice(0, 10)
        if (!min || d < min) min = d
        if (!max || d > max) max = d
      }
    }
    return { firstDate: min, lastDate: max }
  }, [allExpenses])

  const activeFilterCount = countActiveFilters(filters)

  const addCategory = useCallback(
    (id: number) => {
      setDraft((d) => {
        const existing = d.categoryIds ?? []
        if (existing.includes(id)) return d
        return { ...d, categoryIds: [...existing, id] }
      })
      setCatPickerOpen(false)
    },
    [],
  )

  const removeCategory = useCallback((id: number) => {
    setDraft((d) => {
      const next = (d.categoryIds ?? []).filter((cid) => cid !== id)
      return { ...d, categoryIds: next.length > 0 ? next : undefined }
    })
  }, [])

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

  const selectedCategories = useMemo(() => {
    if (!draft.categoryIds) return []
    return draft.categoryIds
      .map((id) => categories.find((c) => c.id === id))
      .filter(Boolean) as Category[]
  }, [draft.categoryIds, categories])

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
            {/* Category filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">
                  {t('filterCategory')}
                </label>
              </div>

              {/* Selected category chips */}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedCategories.map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-medium pl-2 pr-1 py-1 rounded-full"
                    >
                      <CategoryIcon
                        category={cat}
                        className="w-3.5 h-3.5"
                      />
                      {tCat(`${cat.grouping}.${cat.name}`)}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.id)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Category picker toggle */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-between"
                onClick={() => setCatPickerOpen(!catPickerOpen)}
              >
                <span className="text-muted-foreground text-sm">
                  {t('filterAddCategory')}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${catPickerOpen ? 'rotate-180' : ''}`}
                />
              </Button>

              {catPickerOpen && (
                <div className="border rounded-md mt-2 overflow-hidden">
                  <Command>
                    <CommandInput
                      placeholder={tCat('search')}
                      className="text-base"
                    />
                    <CommandEmpty>{tCat('noCategory')}</CommandEmpty>
                    <div className="max-h-[200px] overflow-y-auto">
                      {Object.entries(categoriesByGroup).map(
                        ([group, cats]) => (
                          <CommandGroup
                            key={group}
                            heading={tCat(`${group}.heading`)}
                          >
                            {cats.map((cat) => {
                              const isSelected = (
                                draft.categoryIds ?? []
                              ).includes(cat.id)
                              return (
                                <CommandItem
                                  key={cat.id}
                                  value={`${cat.id} ${tCat(`${cat.grouping}.heading`)} ${tCat(`${cat.grouping}.${cat.name}`)}`}
                                  onSelect={() => {
                                    if (isSelected) {
                                      removeCategory(cat.id)
                                    } else {
                                      addCategory(cat.id)
                                    }
                                  }}
                                  className={
                                    isSelected ? 'opacity-50' : ''
                                  }
                                >
                                  <div className="flex items-center gap-3">
                                    <CategoryIcon
                                      category={cat}
                                      className="w-4 h-4"
                                    />
                                    {tCat(`${cat.grouping}.${cat.name}`)}
                                  </div>
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        ),
                      )}
                    </div>
                  </Command>
                </div>
              )}
            </div>

            {/* Date range filter */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <label className="text-sm font-medium">
                  {t('filterDate')}
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="text-base flex-1"
                  value={draft.dateFrom ?? firstDate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      dateFrom: e.target.value || undefined,
                    }))
                  }
                />
                <span className="text-muted-foreground text-sm">–</span>
                <Input
                  type="date"
                  className="text-base flex-1"
                  value={draft.dateTo ?? lastDate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      dateTo: e.target.value || undefined,
                    }))
                  }
                />
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
