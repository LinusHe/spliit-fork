import { Check, ChevronDown, Loader2 } from 'lucide-react'

import { CategoryIcon } from '@/app/groups/[groupId]/expenses/category-icon'
import { Button, ButtonProps } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  MobilePickerSheet,
  mobilePickerCommandClassName,
  mobilePickerScrollClassName,
} from '@/components/mobile-picker-sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMediaQuery } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Category } from '@prisma/client'
import { useTranslations } from 'next-intl'
import { forwardRef, useEffect, useState } from 'react'

type Props = {
  categories: Category[]
  onValueChange: (categoryId: Category['id']) => void
  /** Category ID to be selected by default. Overwriting this value will update current selection, too. */
  defaultValue: Category['id']
  isLoading: boolean
}

export function CategorySelector({
  categories,
  onValueChange,
  defaultValue,
  isLoading,
}: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<number>(defaultValue)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const tForm = useTranslations('ExpenseForm')

  // allow overwriting currently selected category from outside
  useEffect(() => {
    setValue(defaultValue)
    onValueChange(defaultValue)
  }, [defaultValue])

  const selectedCategory =
    categories.find((category) => category.id === value) ?? categories[0]

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <CategoryButton
            category={selectedCategory}
            open={open}
            isLoading={isLoading}
          />
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <CategoryCommand
            categories={categories}
            selectedId={selectedCategory?.id}
            onValueChange={(id) => {
              setValue(id)
              onValueChange(id)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <MobilePickerSheet
      open={open}
      onOpenChange={setOpen}
      title={tForm('categoryField.label')}
      className="h-[85dvh]"
      trigger={
        <CategoryButton
          category={selectedCategory}
          open={open}
          isLoading={isLoading}
        />
      }
    >
      <CategoryCommand
        categories={categories}
        selectedId={selectedCategory?.id}
        onValueChange={(id) => {
          setValue(id)
          onValueChange(id)
          setOpen(false)
        }}
        className={mobilePickerCommandClassName}
        scrollClassName={mobilePickerScrollClassName}
      />
    </MobilePickerSheet>
  )
}

function CategoryCommand({
  categories,
  selectedId,
  onValueChange,
  className,
  scrollClassName,
}: {
  categories: Category[]
  selectedId?: Category['id']
  onValueChange: (categoryId: Category['id']) => void
  className?: string
  scrollClassName?: string
}) {
  const t = useTranslations('Categories')
  const categoriesByGroup = categories.reduce<Record<string, Category[]>>(
    (acc, category) => ({
      ...acc,
      [category.grouping]: [...(acc[category.grouping] ?? []), category],
    }),
    {},
  )

  return (
    <Command className={className}>
      <CommandInput placeholder={t('search')} className="text-base" />
      <CommandList
        className={cn('w-full', scrollClassName)}
      >
        <CommandEmpty>{t('noCategory')}</CommandEmpty>
        {Object.entries(categoriesByGroup).map(
          ([group, groupCategories]) => (
            <CommandGroup key={group} heading={t(`${group}.heading`)}>
              {groupCategories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`${category.id} ${t(
                    `${category.grouping}.heading`,
                  )} ${t(`${category.grouping}.${category.name}`)}`}
                  onSelect={() => onValueChange(category.id)}
                >
                  <CategoryLabel category={category} />
                  {category.id === selectedId && (
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ),
        )}
      </CommandList>
    </Command>
  )
}

type CategoryButtonProps = {
  category: Category
  open: boolean
  isLoading: boolean
}
const CategoryButton = forwardRef<HTMLButtonElement, CategoryButtonProps>(
  (
    { category, open, isLoading, ...props }: ButtonProps & CategoryButtonProps,
    ref,
  ) => {
    const iconClassName = 'ml-2 h-4 w-4 shrink-0 opacity-50'
    return (
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="flex w-full justify-between"
        ref={ref}
        {...props}
      >
        <CategoryLabel category={category} />
        {isLoading ? (
          <Loader2 className={`animate-spin ${iconClassName}`} />
        ) : (
          <ChevronDown className={iconClassName} />
        )}
      </Button>
    )
  },
)
CategoryButton.displayName = 'CategoryButton'

function CategoryLabel({ category }: { category: Category }) {
  const t = useTranslations('Categories')
  return (
    <div className="flex items-center gap-3">
      <CategoryIcon category={category} className="w-4 h-4" />
      {t(`${category.grouping}.${category.name}`)}
    </div>
  )
}
