'use client'

import { CreateExpenseForm } from '@/app/groups/[groupId]/expenses/create-expense-form'
import { useExpenseDrawerOptional } from '@/app/groups/[groupId]/expenses/expense-drawer-context'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * When navigating directly to /expenses/create:
 * - If inside the drawer context (group layout), open the create drawer and go back
 * - Otherwise, render the create form inline as before (fallback)
 */
export function CreateExpenseRedirect({
  groupId,
  runtimeFeatureFlags,
}: {
  groupId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const drawerCtx = useExpenseDrawerOptional()
  const router = useRouter()
  const searchParams = useSearchParams()
  const didRedirect = useRef(false)

  useEffect(() => {
    if (drawerCtx && !didRedirect.current) {
      didRedirect.current = true
      // Pass along any search params (pre-fill data from duplicate, receipt, etc.)
      drawerCtx.openCreateExpense(
        searchParams.size > 0 ? searchParams : undefined,
      )
      router.replace(`/groups/${groupId}`)
    }
  }, [drawerCtx, groupId, router, searchParams])

  if (drawerCtx) {
    return null
  }

  // Fallback: render inline
  return (
    <CreateExpenseForm
      groupId={groupId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
