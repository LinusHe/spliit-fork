import type { getActivities, getExpense, getGroup } from '@/lib/api'
import { expenseFormSchema } from '@/lib/schemas'
import type { Category } from '@prisma/client'
import { z } from 'zod'

export type StoredExpense = NonNullable<Awaited<ReturnType<typeof getExpense>>>
export type Snapshot = {
  group: NonNullable<Awaited<ReturnType<typeof getGroup>>>
  expenses: StoredExpense[]
  categories: Category[]
  activities: Awaited<ReturnType<typeof getActivities>>
  savedAt: number
}

export const mutationSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['create', 'update', 'delete']),
  groupId: z.string().min(1).max(100),
  expenseId: z.string().min(1).max(100),
  baseVersion: z.string().max(100).nullable(),
  groupCurrency: z.string().max(100),
  values: expenseFormSchema.optional(),
  participantId: z.string().max(100).optional(),
  localTime: z.number(),
})
export type PendingMutation = z.infer<typeof mutationSchema>
export type SyncResult =
  | { status: 'applied' }
  | { status: 'conflict'; current: StoredExpense | null }

export function currencyIdentity(group: Snapshot['group']) {
  return JSON.stringify([group.currency, group.currencyCode])
}

export type OfflineData = {
  snapshots: Record<string, Snapshot>
  queue: PendingMutation[]
}
