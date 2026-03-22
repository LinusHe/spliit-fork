'use client'

import { EditExpenseForm } from '@/app/groups/[groupId]/expenses/edit-expense-form'
import { useExpenseDrawerOptional } from '@/app/groups/[groupId]/expenses/expense-drawer-context'
import { RuntimeFeatureFlags } from '@/lib/featureFlags'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * When navigating directly to /expenses/{id}/edit:
 * - If inside the drawer context (group layout), open the drawer and go back
 * - Otherwise, render the edit form inline as before (fallback)
 */
export function EditExpenseRedirect({
  groupId,
  expenseId,
  runtimeFeatureFlags,
}: {
  groupId: string
  expenseId: string
  runtimeFeatureFlags: RuntimeFeatureFlags
}) {
  const drawerCtx = useExpenseDrawerOptional()
  const router = useRouter()
  const didRedirect = useRef(false)

  useEffect(() => {
    if (drawerCtx && !didRedirect.current) {
      didRedirect.current = true
      drawerCtx.openExpense(expenseId)
      // Navigate back to the group page so the drawer overlays it
      router.replace(`/groups/${groupId}`)
    }
  }, [drawerCtx, expenseId, groupId, router])

  // If we have the drawer context, show nothing (we're redirecting)
  if (drawerCtx) {
    return null
  }

  // Fallback: render inline form (e.g. if accessed outside group layout somehow)
  return (
    <EditExpenseForm
      groupId={groupId}
      expenseId={expenseId}
      runtimeFeatureFlags={runtimeFeatureFlags}
    />
  )
}
