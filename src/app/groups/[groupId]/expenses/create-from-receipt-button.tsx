'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  ReceiptExtractedInfo,
  extractExpenseInformationFromImage,
  extractExpenseWithItemsFromImage,
} from '@/app/groups/[groupId]/expenses/create-from-receipt-button-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { type Currency } from '@/lib/currency'
import { useActiveUser, useMediaQuery } from '@/lib/hooks'
import {
  formatCurrency,
  formatDateOnly,
  getCurrencyFromGroup,
} from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { Category } from '@prisma/client'
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  Users,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { PropsWithChildren, ReactNode, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 10 * 1024 ** 2

type ItemAssignment = {
  name: string
  qty: number
  price: number
  categoryId: string | null
  participantIds: string[] // empty = all
}

type ExpensePreview = {
  title: string
  amount: number
  categoryId: string | null
  participantIds: string[] // empty = all
}

function groupItemsIntoExpenses(
  items: ItemAssignment[],
  mainTitle: string,
): ExpensePreview[] {
  const groups = new Map<string, ExpensePreview>()

  for (const item of items) {
    const sortedIds = [...item.participantIds].sort()
    const key = `${item.categoryId ?? 'null'}|${sortedIds.join(',')}`

    const existing = groups.get(key)
    if (existing) {
      existing.amount = Math.round((existing.amount + item.price) * 100) / 100
    } else {
      groups.set(key, {
        title: mainTitle,
        amount: item.price,
        categoryId: item.categoryId,
        participantIds: item.participantIds,
      })
    }
  }

  return Array.from(groups.values())
}

export function CreateFromReceiptButton() {
  const t = useTranslations('CreateFromReceipt')
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const [open, setOpen] = useState(false)

  const DialogOrDrawer = isDesktop
    ? CreateFromReceiptDialog
    : CreateFromReceiptDrawer

  return (
    <DialogOrDrawer
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          size="icon"
          variant="secondary"
          title={t('Dialog.triggerTitle')}
        >
          <Receipt className="w-4 h-4" />
        </Button>
      }
      title={
        <>
          <span>{t('Dialog.title')}</span>
          <Badge className="bg-pink-700 hover:bg-pink-600 dark:bg-pink-500 dark:hover:bg-pink-600">
            Beta
          </Badge>
        </>
      }
      description={<>{t('Dialog.description')}</>}
    >
      <ReceiptDialogContent onClose={() => setOpen(false)} />
    </DialogOrDrawer>
  )
}

function ReceiptDialogContent({ onClose }: { onClose: () => void }) {
  const { group, groupId } = useCurrentGroup()
  const { data: categoriesData } = trpc.categories.list.useQuery({ groupId })
  const categories = categoriesData?.categories
  const createExpenseMutation = trpc.groups.expenses.create.useMutation()

  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
  const tCat = useTranslations('Categories')
  const [pending, setPending] = useState(false)
  const [creating, setCreating] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [extractItems, setExtractItems] = useState(false)
  const activeUser = useActiveUser(groupId)

  // States for results
  const [receiptInfo, setReceiptInfo] = useState<ReceiptExtractedInfo | null>(
    null,
  )
  const [items, setItems] = useState<ItemAssignment[]>([])
  const [hasItems, setHasItems] = useState(false)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)

  const formatReceiptDate = (dateStr: string) => {
    try {
      return formatDateOnly(new Date(`${dateStr}T12:00:00.000Z`), locale, {
        dateStyle: 'medium',
      })
    } catch {
      return dateStr
    }
  }

  const getCategoryLabel = (categoryId: string | null) => {
    if (!categoryId || !categories) return null
    const cat = categories.find((c) => String(c.id) === categoryId)
    if (!cat) return null
    try {
      return tCat(`${cat.grouping}.${cat.name}`)
    } catch {
      return cat.name
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('TooBigToast.title'),
        description: t('TooBigToast.description', {
          maxSize: '10 MB',
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        }),
        variant: 'destructive',
      })
      return
    }

    try {
      setPending(true)
      setReceiptInfo(null)
      setItems([])
      setHasItems(false)

      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch('/api/receipt-upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { path: filePath } = (await uploadRes.json()) as { path: string }

      if (extractItems) {
        const result = await extractExpenseWithItemsFromImage(
          filePath,
          file.type,
          groupId,
        )
        setReceiptInfo(result)
        if (result.items.length > 0) {
          setItems(
            result.items.map((item) => ({
              ...item,
              participantIds: [], // empty = all
            })),
          )
          setHasItems(true)
        }
      } else {
        const result = await extractExpenseInformationFromImage(
          filePath,
          file.type,
          groupId,
        )
        setReceiptInfo(result)
      }
    } catch (err) {
      console.error(err)
      toast({
        title: t('ErrorToast.title'),
        description: t('ErrorToast.description'),
        variant: 'destructive',
      })
    } finally {
      setPending(false)
    }
  }

  const updateItem = (index: number, updates: Partial<ItemAssignment>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    )
  }

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    if (editingItemIndex === index) setEditingItemIndex(null)
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        name: '',
        qty: 1,
        price: 0,
        categoryId: receiptInfo?.categoryId ?? null,
        participantIds: [],
      },
    ])
    setEditingItemIndex(items.length)
  }

  const toggleParticipant = (itemIndex: number, participantId: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item
        const ids = item.participantIds
        if (ids.length === 0) {
          return { ...item, participantIds: [participantId] }
        }
        if (ids.includes(participantId)) {
          const newIds = ids.filter((id) => id !== participantId)
          return { ...item, participantIds: newIds.length === 0 ? [] : newIds }
        }
        return { ...item, participantIds: [...ids, participantId] }
      }),
    )
  }

  const setAllParticipants = (itemIndex: number) => {
    updateItem(itemIndex, { participantIds: [] })
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0)
  const totalMatches =
    receiptInfo && Math.abs(itemsTotal - receiptInfo.amount) < 0.02

  const expensePreview = hasItems
    ? groupItemsIntoExpenses(items, receiptInfo?.title ?? 'Receipt')
    : []

  const handleSimpleContinue = () => {
    if (!receiptInfo || !group) return
    router.push(
      `/groups/${group.id}/expenses/create?amount=${
        receiptInfo.amount
      }&categoryId=${receiptInfo.categoryId}&date=${
        receiptInfo.date
      }&title=${encodeURIComponent(receiptInfo.title ?? '')}`,
    )
    onClose()
  }

  const handleCreateMultiple = async () => {
    if (!group || !receiptInfo || expensePreview.length === 0) return

    const paidBy = activeUser ?? group.participants[0]?.id
    if (!paidBy) return

    setCreating(true)
    try {
      for (const expense of expensePreview) {
        const paidFor =
          expense.participantIds.length === 0
            ? group.participants.map((p) => ({
                participant: p.id,
                shares: 1,
              }))
            : expense.participantIds.map((id) => ({
                participant: id,
                shares: 1,
              }))

        const categoryLabel = getCategoryLabel(expense.categoryId)

        const title =
          expensePreview.length > 1 && categoryLabel
            ? `${expense.title} — ${categoryLabel}`
            : expense.title

        await createExpenseMutation.mutateAsync({
          groupId,
          expenseFormValues: {
            title,
            amount: Math.round(expense.amount * 100),
            expenseDate: new Date(`${receiptInfo.date}T12:00:00.000Z`),
            category: Number(expense.categoryId) || 0,
            paidBy,
            paidFor,
            splitMode: 'EVENLY',
            isReimbursement: false,
            saveDefaultSplittingOptions: false,
            documents: [],
            notes: '',
            recurrenceRule: 'NONE',
          },
          participantId: paidBy,
        })
      }

      toast({
        title: `${expensePreview.length} ${t('Dialog.expensesCreated', {
          count: expensePreview.length,
        })}`,
      })

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast({
        title: t('ErrorToast.title'),
        description: t('ErrorToast.description'),
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const participants = group?.participants ?? []
  const currency = group ? getCurrencyFromGroup(group) : null

  // ========= RENDER =========

  // Step 1: No scan yet
  if (!receiptInfo && !pending) {
    return (
      <div className="flex flex-col gap-4 py-2 pb-6">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-4 rounded-xl border-2 border-dashed border-muted-foreground/25 p-5 hover:border-primary/50 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Camera className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-medium">{t('Dialog.camera')}</div>
            <div className="text-sm text-muted-foreground">
              {t('Dialog.cameraSub')}
            </div>
          </div>
        </button>

        <button
          onClick={() => galleryInputRef.current?.click()}
          className="flex items-center gap-4 rounded-xl border-2 border-dashed border-muted-foreground/25 p-5 hover:border-primary/50 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <ImageIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="text-left">
            <div className="font-medium">{t('Dialog.gallery')}</div>
            <div className="text-sm text-muted-foreground">
              {t('Dialog.gallerySub')}
            </div>
          </div>
        </button>

        <div className="flex items-center justify-between px-1 pt-2 border-t">
          <div>
            <div className="text-sm font-medium">
              {t('Dialog.extractItems')}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Dialog.extractItemsSub')}
            </div>
          </div>
          <Switch checked={extractItems} onCheckedChange={setExtractItems} />
        </div>
      </div>
    )
  }

  // Step 2: Scanning
  if (pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 pb-16">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          {extractItems ? t('Dialog.analyzingItems') : t('Dialog.analyzing')}
        </div>
      </div>
    )
  }

  // Step 3a: Results WITHOUT items
  if (receiptInfo && !hasItems) {
    const cat =
      receiptInfo.categoryId &&
      categories?.find((c) => String(c.id) === receiptInfo.categoryId)

    return (
      <div className="flex flex-col gap-4 py-2 pb-6">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">
            {receiptInfo.title ?? t('unknown')}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            {receiptInfo.amount && currency ? (
              <span className="text-foreground font-medium text-base">
                {formatCurrency(currency, receiptInfo.amount, locale, true)}
              </span>
            ) : null}
            <span>{formatReceiptDate(receiptInfo.date)}</span>
            {cat ? (
              <span className="flex items-center gap-1">
                <CategoryIcon category={cat} className="inline w-3.5 h-3.5" />
                {getCategoryLabel(receiptInfo.categoryId)}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t('Dialog.editNext')}</p>

        <Button onClick={handleSimpleContinue} className="w-full">
          {t('Dialog.continue')}
        </Button>
      </div>
    )
  }

  // Step 3b: Results WITH items
  return (
    <div className="flex flex-col gap-3 py-2 pb-8 max-h-[70vh] overflow-y-auto">
      {/* Summary header */}
      <div className="rounded-lg border p-3">
        <div className="font-semibold">{receiptInfo?.title ?? 'Receipt'}</div>
        <div className="flex gap-3 text-sm text-muted-foreground mt-1">
          {currency && receiptInfo && (
            <span>
              {t('Dialog.total')}:{' '}
              {formatCurrency(currency, receiptInfo.amount, locale, true)}
            </span>
          )}
          <span>{receiptInfo && formatReceiptDate(receiptInfo.date)}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="text-xs font-medium text-muted-foreground px-1">
        {items.length} {t('Dialog.positions')}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <ItemCard
            key={index}
            item={item}
            index={index}
            participants={participants}
            categories={categories ?? []}
            expanded={editingItemIndex === index}
            onToggleExpand={() =>
              setEditingItemIndex(editingItemIndex === index ? null : index)
            }
            onUpdate={(updates) => updateItem(index, updates)}
            onRemove={() => removeItem(index)}
            onToggleParticipant={(pid) => toggleParticipant(index, pid)}
            onSetAll={() => setAllParticipants(index)}
            currency={getCurrencyFromGroup(group!)}
            locale={locale}
          />
        ))}
      </div>

      {/* Add item button */}
      <button
        onClick={addItem}
        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 px-1 py-1"
      >
        <Plus className="w-4 h-4" />
        {t('Dialog.addPosition')}
      </button>

      {/* Sum check */}
      <div
        className={`flex items-center gap-2 text-sm px-1 ${
          totalMatches
            ? 'text-green-600 dark:text-green-400'
            : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        {totalMatches ? (
          <Check className="w-4 h-4" />
        ) : (
          <span className="text-xs">⚠️</span>
        )}
        <span>
          Σ {itemsTotal.toFixed(2)}€
          {!totalMatches &&
            receiptInfo &&
            ` (${t('Dialog.total')}: ${receiptInfo.amount.toFixed(2)}€)`}
        </span>
      </div>

      {/* Expense preview */}
      {expensePreview.length > 0 && (
        <div className="rounded-lg border bg-accent/30 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            → {t('Dialog.createsExpenses', { count: expensePreview.length })}
          </div>
          {expensePreview.map((exp, i) => {
            const catLabel = getCategoryLabel(exp.categoryId)
            const pNames =
              exp.participantIds.length === 0
                ? t('Dialog.everyone')
                : exp.participantIds
                    .map(
                      (id) => participants.find((p) => p.id === id)?.name ?? id,
                    )
                    .join(', ')
            return (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span>
                  {exp.title}
                  {catLabel && expensePreview.length > 1
                    ? ` — ${catLabel}`
                    : ''}
                  <span className="text-muted-foreground ml-1">({pNames})</span>
                </span>
                <span className="font-medium">{exp.amount.toFixed(2)}€</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1 pb-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleSimpleContinue}
        >
          {t('Dialog.withoutItems')}
        </Button>
        <Button
          className="flex-1"
          onClick={handleCreateMultiple}
          disabled={creating || items.length === 0}
        >
          {creating && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {expensePreview.length > 1
            ? t('Dialog.createMultiple', { count: expensePreview.length })
            : t('Dialog.createOne')}
        </Button>
      </div>
    </div>
  )
}

// ========= Item Card with proper CategorySelector =========

function ItemCategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const tCat = useTranslations('Categories')
  const t = useTranslations('CreateFromReceipt')

  const selectedCategory = value
    ? categories.find((c) => String(c.id) === value)
    : null

  const categoriesByGroup = categories.reduce<Record<string, Category[]>>(
    (acc, category) => ({
      ...acc,
      [category.grouping]: [...(acc[category.grouping] ?? []), category],
    }),
    {},
  )

  const commandContent = (
    <Command>
      <CommandInput placeholder={tCat('search')} className="text-base" />
      <CommandEmpty>{tCat('noCategory')}</CommandEmpty>
      <div className="w-full max-h-[250px] overflow-y-auto">
        {Object.entries(categoriesByGroup).map(([group, groupCategories]) => (
          <CommandGroup key={group} heading={tCat(`${group}.heading`)}>
            {groupCategories.map((category) => (
              <CommandItem
                key={category.id}
                value={`${category.id} ${tCat(
                  `${category.grouping}.heading`,
                )} ${tCat(`${category.grouping}.${category.name}`)}`}
                onSelect={() => {
                  onChange(String(category.id))
                  setOpen(false)
                }}
              >
                <div className="flex items-center gap-3">
                  <CategoryIcon category={category} className="w-4 h-4" />
                  {tCat(`${category.grouping}.${category.name}`)}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </div>
    </Command>
  )

  const triggerButton = (
    <Button
      variant="outline"
      size="sm"
      role="combobox"
      aria-expanded={open}
      className="w-full justify-between h-8 text-sm"
      onClick={() => setOpen(!open)}
    >
      {selectedCategory ? (
        <div className="flex items-center gap-2">
          <CategoryIcon category={selectedCategory} className="w-3.5 h-3.5" />
          <span className="truncate">
            {tCat(`${selectedCategory.grouping}.${selectedCategory.name}`)}
          </span>
        </div>
      ) : (
        <span className="text-muted-foreground">{t('Dialog.noCategory')}</span>
      )}
      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
    </Button>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent className="p-0 w-[280px]" align="start">
          {commandContent}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent className="p-0">{commandContent}</DrawerContent>
    </Drawer>
  )
}

function ItemCard({
  item,
  index,
  participants,
  categories,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onToggleParticipant,
  onSetAll,
  currency,
  locale,
}: {
  item: ItemAssignment
  index: number
  participants: { id: string; name: string }[]
  categories: Category[]
  expanded: boolean
  onToggleExpand: () => void
  onUpdate: (updates: Partial<ItemAssignment>) => void
  onRemove: () => void
  onToggleParticipant: (participantId: string) => void
  onSetAll: () => void
  currency: Currency
  locale: string
}) {
  const tCat = useTranslations('Categories')
  const t = useTranslations('CreateFromReceipt')

  const participantLabel =
    item.participantIds.length === 0
      ? t('Dialog.everyone')
      : item.participantIds.length === participants.length
      ? t('Dialog.everyone')
      : item.participantIds
          .map((id) => participants.find((p) => p.id === id)?.name ?? '?')
          .join(', ')

  const selectedCategory = item.categoryId
    ? categories.find((c) => String(c.id) === item.categoryId)
    : null

  const categoryLabel = selectedCategory
    ? (() => {
        try {
          return tCat(`${selectedCategory.grouping}.${selectedCategory.name}`)
        } catch {
          return selectedCategory.name
        }
      })()
    : null

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Collapsed row */}
      <button
        onClick={onToggleExpand}
        className="flex items-center w-full gap-2 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {item.name || t('Dialog.newPosition')}
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {participantLabel}
            </span>
            {selectedCategory && (
              <span className="flex items-center gap-1">
                ·{' '}
                <CategoryIcon category={selectedCategory} className="w-3 h-3" />
                {categoryLabel}
              </span>
            )}
          </div>
        </div>
        <div className="text-sm font-medium whitespace-nowrap">
          {item.price.toFixed(2)}€
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t p-3 flex flex-col gap-3 bg-accent/20">
          {/* Name + Price */}
          <div className="flex gap-2">
            <Input
              value={item.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder={t('Dialog.itemName')}
              className="flex-1 h-8 text-sm"
            />
            <Input
              value={item.price || ''}
              onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
              placeholder="0.00"
              type="number"
              step="0.01"
              className="w-24 h-8 text-sm text-right"
            />
          </div>

          {/* Participants */}
          <div>
            <div className="text-xs font-medium mb-1.5">
              {t('Dialog.assignment')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={onSetAll}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  item.participantIds.length === 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {t('Dialog.everyone')}
              </button>
              {participants.map((p) => {
                const selected = item.participantIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => onToggleParticipant(p.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <div className="text-xs font-medium mb-1.5">
              {t('Dialog.categoryLabel')}
            </div>
            <ItemCategoryPicker
              categories={categories}
              value={item.categoryId}
              onChange={(id) => onUpdate({ categoryId: id })}
            />
          </div>

          {/* Delete */}
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 self-end"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('Dialog.remove')}
          </button>
        </div>
      )}
    </div>
  )
}

function CreateFromReceiptDialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription className="text-left">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CreateFromReceiptDrawer({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">{title}</DrawerTitle>
          <DrawerDescription className="text-left">
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-8 overflow-y-auto">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
