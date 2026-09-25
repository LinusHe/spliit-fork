'use client'

import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '@/lib/hooks'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { getCurrencyFromGroup } from '@/lib/utils'
import { trpc } from '@/trpc/client'
import { useCurrentGroup } from '../current-group-context'
import { useExpenseDrawer } from './expense-drawer-context'
import { duplicateExpenseParams } from './duplicate-expense'
import { ExpenseForm } from './expense-form'

export function ExpenseDrawer({
  runtimeFeatureFlags,
}: {
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { state, closeDrawer } = useExpenseDrawer()
  const isOpen = state.mode !== 'closed'
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const title = state.mode === 'edit' ? 'Edit Expense' : 'Create Expense'

  const body = (
    <>
      {state.mode === 'edit' && (
        <EditExpenseInDrawer
          expenseId={state.expenseId}
          runtimeFeatureFlags={runtimeFeatureFlags}
        />
      )}
      {state.mode === 'create' && (
        <CreateExpenseInDrawer
          searchParams={state.params}
          runtimeFeatureFlags={runtimeFeatureFlags}
        />
      )}
    </>
  )

  if (isDesktop) {
    return (
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeDrawer()
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl p-0 flex flex-col gap-0"
        >
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <div className="overflow-y-auto overscroll-contain px-6 py-6">
            {body}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeDrawer()
      }}
      shouldScaleBackground={false}
      repositionInputs={false}
    >
      <DrawerContent className="max-h-[85vh] overflow-hidden">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <div className="overflow-y-auto overscroll-contain px-4 pb-8 pt-2">
          {body}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function EditExpenseInDrawer({
  expenseId,
  runtimeFeatureFlags,
}: {
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { closeDrawer, openCreateExpense } = useExpenseDrawer()
  const { groupId, group } = useCurrentGroup()
  const utils = trpc.useUtils()

  const { data: categoriesData } = trpc.categories.list.useQuery({ groupId })
  const categories = categoriesData?.categories

  const { data: expenseData } = trpc.groups.expenses.get.useQuery({
    groupId,
    expenseId,
  })
  const expense = expenseData?.expense

  const { mutateAsync: updateExpenseMutateAsync } =
    trpc.groups.expenses.update.useMutation()
  const { mutateAsync: deleteExpenseMutateAsync } =
    trpc.groups.expenses.delete.useMutation()

  if (!group || !categories || !expense) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const categoriesWithExpenseCategory =
    expense.category &&
    !categories.some((category) => category.id === expense.category?.id)
      ? [...categories, expense.category]
      : categories

  const duplicateParams = duplicateExpenseParams(
    expense,
    getCurrencyFromGroup(group),
  )

  const handleDuplicate = () => {
    closeDrawer()
    setTimeout(() => {
      openCreateExpense(duplicateParams)
    }, 150)
  }

  return (
    <ExpenseForm
      group={group}
      expense={expense}
      categories={categoriesWithExpenseCategory}
      onDuplicate={handleDuplicate}
      onSubmit={async (expenseFormValues, participantId, baseVersion) => {
        await updateExpenseMutateAsync({
          baseVersion,
          expenseId,
          groupId,
          expenseFormValues,
          participantId,
        })
        utils.groups.expenses.invalidate()
        closeDrawer()
      }}
      onDelete={async (participantId, baseVersion) => {
        await deleteExpenseMutateAsync({
          baseVersion,
          expenseId,
          groupId,
          participantId,
        })
        utils.groups.expenses.invalidate()
        closeDrawer()
      }}
      onCancel={closeDrawer}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}

function CreateExpenseInDrawer({
  searchParams,
  runtimeFeatureFlags,
}: {
  searchParams?: URLSearchParams
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const { closeDrawer } = useExpenseDrawer()
  const { groupId, group } = useCurrentGroup()
  const utils = trpc.useUtils()

  const { data: categoriesData } = trpc.categories.list.useQuery({ groupId })
  const categories = categoriesData?.categories

  const { mutateAsync: createExpenseMutateAsync } =
    trpc.groups.expenses.create.useMutation()

  if (!group || !categories) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <ExpenseForm
      group={group}
      categories={categories}
      drawerSearchParams={searchParams}
      onSubmit={async (expenseFormValues, participantId, _, expenseId) => {
        await createExpenseMutateAsync({
          groupId,
          expenseFormValues,
          participantId,
          expenseId,
        })
        utils.groups.expenses.invalidate()
        closeDrawer()
      }}
      onCancel={closeDrawer}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
