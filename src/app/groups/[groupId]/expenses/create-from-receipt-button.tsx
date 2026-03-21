'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  ReceiptExtractedInfo,
  ReceiptItem,
  ReceiptItemsExtractedInfo,
  extractExpenseInformationFromImage,
  extractExpenseWithItemsFromImage,
} from '@/app/groups/[groupId]/expenses/create-from-receipt-button-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/components/ui/use-toast'
import { useActiveUser, useMediaQuery } from '@/lib/hooks'
import { type Currency } from '@/lib/currency'
import { formatCurrency, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
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
  X,
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

  const result = Array.from(groups.values())

  // Add category name to title if multiple expenses
  if (result.length > 1) {
    result.forEach((exp) => {
      exp.title = mainTitle
    })
  }

  return result
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
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories
  const createExpenseMutation = trpc.groups.expenses.create.useMutation()

  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
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

      // Upload file
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch('/api/receipt-upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      const { path: filePath } = (await uploadRes.json()) as { path: string }

      if (extractItems) {
        // Extract with items
        const result = await extractExpenseWithItemsFromImage(
          filePath,
          file.type,
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
        // Simple extraction (existing flow)
        const result = await extractExpenseInformationFromImage(
          filePath,
          file.type,
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
          // Was "all" → switch to just this one
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
    receiptInfo &&
    Math.abs(itemsTotal - receiptInfo.amount) < 0.02

  const expensePreview = hasItems
    ? groupItemsIntoExpenses(items, receiptInfo?.title ?? 'Receipt')
    : []

  const handleSimpleContinue = () => {
    if (!receiptInfo || !group) return
    router.push(
      `/groups/${group.id}/expenses/create?amount=${receiptInfo.amount}&categoryId=${receiptInfo.categoryId}&date=${receiptInfo.date}&title=${encodeURIComponent(receiptInfo.title ?? '')}`,
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

        const categoryName =
          expense.categoryId &&
          categories?.find((c) => String(c.id) === expense.categoryId)?.name

        const title =
          expensePreview.length > 1 && categoryName
            ? `${expense.title} — ${categoryName}`
            : expense.title

        await createExpenseMutation.mutateAsync({
          groupId,
          expenseFormValues: {
            title,
            amount: Math.round(expense.amount * 100),
            expenseDate: new Date(
              `${receiptInfo.date}T12:00:00.000Z`,
            ),
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
        title: `${expensePreview.length} Ausgaben erstellt`,
        description: expensePreview
          .map(
            (e) =>
              `${e.title}${expensePreview.length > 1 ? '' : ''}: ${e.amount.toFixed(2)}€`,
          )
          .join(', '),
      })

      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Fehler',
        description: 'Ausgaben konnten nicht erstellt werden.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const participants = group?.participants ?? []

  // ========= RENDER =========

  // Step 1: No scan yet → show camera/gallery buttons
  if (!receiptInfo && !pending) {
    return (
      <div className="flex flex-col gap-4 py-2">
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
            <div className="font-medium">Foto aufnehmen</div>
            <div className="text-sm text-muted-foreground">
              Kassenbon mit der Kamera scannen
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
            <div className="font-medium">Aus Galerie</div>
            <div className="text-sm text-muted-foreground">
              Vorhandenes Foto auswählen
            </div>
          </div>
        </button>

        <div className="flex items-center justify-between px-1 pt-2 border-t">
          <div>
            <div className="text-sm font-medium">
              Positionen aufschlüsseln
            </div>
            <div className="text-xs text-muted-foreground">
              Einzelne Items verschiedenen Personen zuordnen
            </div>
          </div>
          <Switch
            checked={extractItems}
            onCheckedChange={setExtractItems}
          />
        </div>
      </div>
    )
  }

  // Step 2: Scanning in progress
  if (pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          {extractItems
            ? 'Kassenbon wird analysiert & Positionen extrahiert...'
            : 'Kassenbon wird analysiert...'}
        </div>
      </div>
    )
  }

  // Step 3a: Results WITHOUT items → simple view, continue to form
  if (receiptInfo && !hasItems) {
    const cat =
      receiptInfo.categoryId &&
      categories?.find((c) => String(c.id) === receiptInfo.categoryId)

    return (
      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">
            {receiptInfo.title ?? 'Unbekannt'}
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            {receiptInfo.amount && group ? (
              <span className="text-foreground font-medium text-base">
                {formatCurrency(
                  getCurrencyFromGroup(group),
                  receiptInfo.amount,
                  locale,
                  true,
                )}
              </span>
            ) : null}
            <span>{receiptInfo.date}</span>
            {cat ? (
              <span className="flex items-center gap-1">
                <CategoryIcon
                  category={cat}
                  className="inline w-3.5 h-3.5"
                />
                {cat.name}
              </span>
            ) : null}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t('Dialog.editNext')}</p>

        <Button onClick={handleSimpleContinue} className="w-full">
          Weiter zum Formular
        </Button>
      </div>
    )
  }

  // Step 3b: Results WITH items → item editor
  return (
    <div className="flex flex-col gap-3 py-2 max-h-[70vh] overflow-y-auto">
      {/* Summary header */}
      <div className="rounded-lg border p-3">
        <div className="font-semibold">{receiptInfo?.title ?? 'Receipt'}</div>
        <div className="flex gap-3 text-sm text-muted-foreground mt-1">
          <span>
            Gesamt:{' '}
            {group &&
              receiptInfo &&
              formatCurrency(
                getCurrencyFromGroup(group),
                receiptInfo.amount,
                locale,
                true,
              )}
          </span>
          <span>{receiptInfo?.date}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="text-xs font-medium text-muted-foreground px-1">
        {items.length} Positionen
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
              setEditingItemIndex(
                editingItemIndex === index ? null : index,
              )
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
        Position hinzufügen
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
            ` (Gesamt: ${receiptInfo.amount.toFixed(2)}€)`}
        </span>
      </div>

      {/* Expense preview */}
      {expensePreview.length > 0 && (
        <div className="rounded-lg border bg-accent/30 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            → Erstellt {expensePreview.length} Ausgabe
            {expensePreview.length > 1 ? 'n' : ''}:
          </div>
          {expensePreview.map((exp, i) => {
            const catName =
              exp.categoryId &&
              categories?.find((c) => String(c.id) === exp.categoryId)
                ?.name
            const pNames =
              exp.participantIds.length === 0
                ? 'Alle'
                : exp.participantIds
                    .map(
                      (id) =>
                        participants.find((p) => p.id === id)?.name ?? id,
                    )
                    .join(', ')
            return (
              <div
                key={i}
                className="flex justify-between text-sm py-0.5"
              >
                <span>
                  {exp.title}
                  {catName && expensePreview.length > 1
                    ? ` — ${catName}`
                    : ''}
                  <span className="text-muted-foreground ml-1">
                    ({pNames})
                  </span>
                </span>
                <span className="font-medium">
                  {exp.amount.toFixed(2)}€
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleSimpleContinue}
        >
          Ohne Items weiter
        </Button>
        <Button
          className="flex-1"
          onClick={handleCreateMultiple}
          disabled={creating || items.length === 0}
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          {expensePreview.length > 1
            ? `${expensePreview.length} Ausgaben erstellen`
            : 'Ausgabe erstellen'}
        </Button>
      </div>
    </div>
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
  categories: { id: number; grouping: string; name: string }[]
  expanded: boolean
  onToggleExpand: () => void
  onUpdate: (updates: Partial<ItemAssignment>) => void
  onRemove: () => void
  onToggleParticipant: (participantId: string) => void
  onSetAll: () => void
  currency: Currency
  locale: string
}) {
  const participantLabel =
    item.participantIds.length === 0
      ? 'Alle'
      : item.participantIds.length === participants.length
        ? 'Alle'
        : item.participantIds
            .map((id) => participants.find((p) => p.id === id)?.name ?? '?')
            .join(', ')

  const categoryName =
    item.categoryId &&
    categories.find((c) => String(c.id) === item.categoryId)?.name

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Collapsed row */}
      <button
        onClick={onToggleExpand}
        className="flex items-center w-full gap-2 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.name || 'Neue Position'}</div>
          <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {participantLabel}
            </span>
            {categoryName && <span>· {categoryName}</span>}
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
              placeholder="Name"
              className="flex-1 h-8 text-sm"
            />
            <Input
              value={item.price || ''}
              onChange={(e) =>
                onUpdate({ price: Number(e.target.value) || 0 })
              }
              placeholder="0.00"
              type="number"
              step="0.01"
              className="w-24 h-8 text-sm text-right"
            />
          </div>

          {/* Participants */}
          <div>
            <div className="text-xs font-medium mb-1.5">Zuordnung</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={onSetAll}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  item.participantIds.length === 0
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Alle
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
            <div className="text-xs font-medium mb-1.5">Kategorie</div>
            <select
              value={item.categoryId ?? ''}
              onChange={(e) =>
                onUpdate({
                  categoryId: e.target.value || null,
                })
              }
              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Keine Kategorie</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.grouping} / {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Delete */}
          <button
            onClick={onRemove}
            className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 self-end"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Entfernen
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
        <div className="px-4 pb-4 overflow-y-auto">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
