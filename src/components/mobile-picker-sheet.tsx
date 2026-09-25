'use client'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { ReactNode } from 'react'

/**
 * Bottom sheet for pickers on mobile (category, currency, …).
 *
 * Deliberately NOT a vaul Drawer: these pickers open on top of the expense
 * drawer, and a second vaul drawer broke touch input there. vaul pins the body
 * with `position: fixed` on iOS while a drawer opens/closes (the drawer below
 * jumps), captures the pointer on the touched item and turns small finger
 * movements on the list into a drawer drag, so taps got lost. A plain Radix
 * dialog has no drag handling and scrolls natively.
 */
export function MobilePickerSheet({
  open,
  onOpenChange,
  trigger,
  title,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        hideCloseButton
        className={cn(
          'flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        // Opening the keyboard for the search field would shift the list
        // while the user is about to tap an entry.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between border-b py-1 pl-4 pr-1">
          <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          <SheetClose className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  )
}

/** Classes for a cmdk list inside the sheet: natively scrolling, big targets. */
export const mobilePickerCommandClassName =
  'flex min-h-0 flex-1 flex-col rounded-none [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:min-h-11 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:text-base'
export const mobilePickerScrollClassName =
  'max-h-none min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4'
