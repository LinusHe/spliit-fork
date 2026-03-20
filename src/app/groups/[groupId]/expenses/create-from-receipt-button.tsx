'use client'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import {
  ReceiptExtractedInfo,
  extractExpenseInformationFromImage,
} from '@/app/groups/[groupId]/expenses/create-from-receipt-button-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/components/ui/use-toast'
import { useMediaQuery } from '@/lib/hooks'
import { formatCurrency, formatDate, getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { ChevronRight, FileQuestion, Loader2, Receipt } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { PropsWithChildren, ReactNode, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 5 * 1024 ** 2

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:...;base64, prefix
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 300, height: 400 })
    img.src = URL.createObjectURL(file)
  })
}

export function CreateFromReceiptButton() {
  const t = useTranslations('CreateFromReceipt')
  const isDesktop = useMediaQuery('(min-width: 640px)')

  const DialogOrDrawer = isDesktop
    ? CreateFromReceiptDialog
    : CreateFromReceiptDrawer

  return (
    <DialogOrDrawer
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
      <ReceiptDialogContent />
    </DialogOrDrawer>
  )
}

function ReceiptDialogContent() {
  const { group } = useCurrentGroup()
  const { data: categoriesData } = trpc.categories.list.useQuery()
  const categories = categoriesData?.categories

  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
  const [pending, setPending] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [receiptInfo, setReceiptInfo] = useState<
    | null
    | (ReceiptExtractedInfo & { width?: number; height?: number })
  >(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('TooBigToast.title'),
        description: t('TooBigToast.description', {
          maxSize: '5 MB',
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        }),
        variant: 'destructive',
      })
      return
    }

    const process = async () => {
      try {
        setPending(true)

        // Create preview
        const objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)

        // Read as base64 and get dimensions
        const [base64, dimensions] = await Promise.all([
          readFileAsBase64(file),
          getImageDimensions(file),
        ])

        // Send to server action
        const result = await extractExpenseInformationFromImage(
          base64,
          file.type,
        )
        setReceiptInfo({ ...result, ...dimensions })
      } catch (err) {
        console.error(err)
        toast({
          title: t('ErrorToast.title'),
          description: t('ErrorToast.description'),
          variant: 'destructive',
          action: (
            <ToastAction
              altText={t('ErrorToast.retry')}
              onClick={() => process()}
            >
              {t('ErrorToast.retry')}
            </ToastAction>
          ),
        })
      } finally {
        setPending(false)
      }
    }
    process()
  }

  const receiptInfoCategory =
    (receiptInfo?.categoryId &&
      categories?.find((c) => String(c.id) === receiptInfo.categoryId)) ||
    null

  return (
    <div className="prose prose-sm dark:prose-invert">
      <p>{t('Dialog.body')}</p>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="grid gap-x-4 gap-y-2 grid-cols-3">
          <Button
            variant="secondary"
            className="row-span-3 w-full h-full relative min-h-[120px]"
            title="Create expense from receipt"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : previewUrl ? (
              <div className="absolute top-2 left-2 bottom-2 right-2">
                <Image
                  src={previewUrl}
                  width={receiptInfo?.width || 300}
                  height={receiptInfo?.height || 400}
                  className="w-full h-full m-0 object-contain drop-shadow-lg"
                  alt="Scanned receipt"
                  unoptimized
                />
              </div>
            ) : (
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('Dialog.selectImage')}
              </span>
            )}
          </Button>
          <div className="col-span-2">
            <strong>{t('Dialog.titleLabel')}</strong>
            <div>{receiptInfo ? receiptInfo.title ?? <Unknown /> : '…'}</div>
          </div>
          <div className="col-span-2">
            <strong>{t('Dialog.categoryLabel')}</strong>
            <div>
              {receiptInfo ? (
                receiptInfoCategory ? (
                  <div className="flex items-center">
                    <CategoryIcon
                      category={receiptInfoCategory}
                      className="inline w-4 h-4 mr-2"
                    />
                    <span className="mr-1">
                      {receiptInfoCategory.grouping}
                    </span>
                    <ChevronRight className="inline w-3 h-3 mr-1" />
                    <span>{receiptInfoCategory.name}</span>
                  </div>
                ) : (
                  <Unknown />
                )
              ) : (
                ''
              )}
            </div>
          </div>
          <div>
            <strong>{t('Dialog.amountLabel')}</strong>
            <div>
              {receiptInfo && group ? (
                receiptInfo.amount ? (
                  <>
                    {formatCurrency(
                      getCurrencyFromGroup(group),
                      receiptInfo.amount,
                      locale,
                      true,
                    )}
                  </>
                ) : (
                  <Unknown />
                )
              ) : (
                '…'
              )}
            </div>
          </div>
          <div>
            <strong>{t('Dialog.dateLabel')}</strong>
            <div>
              {receiptInfo ? (
                receiptInfo.date ? (
                  formatDate(
                    new Date(`${receiptInfo?.date}T12:00:00.000Z`),
                    locale,
                    { dateStyle: 'medium' },
                  )
                ) : (
                  <Unknown />
                )
              ) : (
                '…'
              )}
            </div>
          </div>
        </div>
      </div>
      <p>{t('Dialog.editNext')}</p>
      <div className="text-center">
        <Button
          disabled={pending || !receiptInfo}
          onClick={() => {
            if (!receiptInfo || !group) return
            router.push(
              `/groups/${group.id}/expenses/create?amount=${
                receiptInfo.amount
              }&categoryId=${receiptInfo.categoryId}&date=${
                receiptInfo.date
              }&title=${encodeURIComponent(receiptInfo.title ?? '')}`,
            )
          }}
        >
          {t('Dialog.continue')}
        </Button>
      </div>
    </div>
  )
}

function Unknown() {
  const t = useTranslations('CreateFromReceipt')
  return (
    <div className="flex gap-1 items-center text-muted-foreground">
      <FileQuestion className="w-4 h-4" />
      <em>{t('unknown')}</em>
    </div>
  )
}

function CreateFromReceiptDialog({
  trigger,
  title,
  description,
  children,
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
}>) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
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
}: PropsWithChildren<{
  trigger: ReactNode
  title: ReactNode
  description: ReactNode
}>) {
  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">{title}</DrawerTitle>
          <DrawerDescription className="text-left">
            {description}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
