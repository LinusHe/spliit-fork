'use client'

import { CurrencyCommand } from '@/components/currency-selector'
import {
  MobilePickerSheet,
  mobilePickerCommandClassName,
  mobilePickerScrollClassName,
} from '@/components/mobile-picker-sheet'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Currency } from '@/lib/currency'
import { useMediaQuery } from '@/lib/hooks'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

/**
 * The group's payment currencies (besides the group currency), offered as a
 * one-tap switch in the expense form.
 */
export function QuickCurrenciesField({
  value,
  onChange,
  currencies,
  groupCurrencyCode,
}: {
  value: string[]
  onChange: (value: string[]) => void
  currencies: Currency[]
  groupCurrencyCode: string
}) {
  const t = useTranslations('GroupForm.QuickCurrenciesField')
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const available = currencies.filter(
    (c) => c.code && c.code !== groupCurrencyCode && !value.includes(c.code),
  )
  const add = (code: string) => {
    if (code && !value.includes(code)) onChange([...value, code])
    setOpen(false)
  }
  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 rounded-full"
    >
      <Plus className="mr-1 h-3.5 w-3.5" />
      {t('add')}
    </Button>
  )
  const command = (className?: string, scrollClassName?: string) => (
    <CurrencyCommand
      currencies={available}
      onValueChange={add}
      className={className}
      scrollClassName={scrollClassName}
    />
  )

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="quick-currencies"
    >
      <span className="inline-flex h-9 items-center rounded-full border bg-muted px-3.5 text-sm font-medium text-muted-foreground">
        {groupCurrencyCode}
      </span>
      {value.map((code) => (
        <span
          key={code}
          className="inline-flex h-9 items-center gap-1 rounded-full border pl-3.5 pr-1 text-sm font-medium"
        >
          {code}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t('remove', { currency: code })}
            onClick={() => onChange(value.filter((c) => c !== code))}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      {isDesktop ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            {command()}
          </PopoverContent>
        </Popover>
      ) : (
        <MobilePickerSheet
          open={open}
          onOpenChange={setOpen}
          title={t('label')}
          className="h-[85dvh]"
          trigger={trigger}
        >
          {command(mobilePickerCommandClassName, mobilePickerScrollClassName)}
        </MobilePickerSheet>
      )}
    </div>
  )
}
