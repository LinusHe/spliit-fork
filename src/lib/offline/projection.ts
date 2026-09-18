import {
  getBalances,
  getPublicBalances,
  getSuggestedReimbursements,
} from '@/lib/balances'
import {
  calculateShare,
  getTotalActiveUserPaidFor,
  getTotalActiveUserShare,
  getTotalGroupSpending,
} from '@/lib/totals'
import { Prisma } from '@prisma/client'
import type { PendingMutation, Snapshot, StoredExpense } from './types'

export function project(
  snapshot: Snapshot,
  mutations: PendingMutation[],
): Snapshot {
  let expenses = [...snapshot.expenses]
  for (const mutation of mutations.filter(
    (m) => m.groupId === snapshot.group.id,
  )) {
    const old = expenses.find((e) => e.id === mutation.expenseId)
    expenses = expenses.filter((e) => e.id !== mutation.expenseId)
    if (mutation.kind === 'delete' || !mutation.values) continue
    const v = mutation.values
    const paidBy = snapshot.group.participants.find((p) => p.id === v.paidBy)
    if (!paidBy) continue
    const expense: StoredExpense = {
      id: mutation.expenseId,
      groupId: mutation.groupId,
      syncVersion: mutation.id,
      title: v.title,
      amount: v.amount,
      expenseDate: new Date(v.expenseDate),
      createdAt: old?.createdAt ?? new Date(mutation.localTime),
      categoryId: v.category,
      category: snapshot.categories.find((c) => c.id === v.category) ?? null,
      paidById: v.paidBy,
      paidBy,
      paidFor: v.paidFor.map((p) => ({
        expenseId: mutation.expenseId,
        participantId: p.participant,
        shares: Number(p.shares),
      })),
      splitMode: v.splitMode,
      isReimbursement: v.isReimbursement,
      originalAmount: v.originalAmount ?? null,
      originalCurrency: v.originalCurrency ?? null,
      conversionRate:
        v.conversionRate == null ? null : new Prisma.Decimal(v.conversionRate),
      notes: v.notes ?? null,
      locationName: v.locationName || null,
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      documents: v.documents.map((d) => ({
        ...d,
        expenseId: mutation.expenseId,
      })),
      recurrenceRule: v.recurrenceRule,
      recurringExpenseLink: old?.recurringExpenseLink ?? null,
      recurringExpenseLinkId: old?.recurringExpenseLinkId ?? null,
    }
    expenses.push(expense)
  }
  expenses.sort(
    (a, b) =>
      b.expenseDate.getTime() - a.expenseDate.getTime() ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )
  return { ...snapshot, expenses }
}

export function listExpenses(snapshot: Snapshot) {
  return snapshot.expenses.map((e) => ({
    ...e,
    paidFor: e.paidFor.map((p) => ({
      ...p,
      participant: snapshot.group.participants.find(
        (person) => person.id === p.participantId,
      ) ?? { id: p.participantId, name: 'Entfernte Person' },
    })),
    _count: { documents: e.documents.length },
  }))
}

// Same shapes as the normal tRPC queries, derived from the complete local group.
export function localQuery(
  path: string,
  input: Record<string, any>,
  snapshot: Snapshot,
): unknown {
  const expenses = listExpenses(snapshot)
  const cursor = input.cursor ?? 0
  const limit = input.limit ?? 10
  switch (path) {
    case 'groups.get':
      return { group: snapshot.group }
    case 'groups.getDetails':
      return {
        group: snapshot.group,
        participantsWithExpenses: Array.from(
          new Set(
            expenses.flatMap((e) => [
              e.paidBy.id,
              ...e.paidFor.map((p) => p.participant.id),
            ]),
          ),
        ),
      }
    case 'categories.list': {
      const selected = snapshot.group.categorySelections.map(
        (s) => s.categoryId,
      )
      return {
        categories: selected.length
          ? snapshot.categories.filter((c) => selected.includes(c.id))
          : snapshot.categories,
      }
    }
    case 'groups.expenses.get':
      return {
        expense: snapshot.expenses.find((e) => e.id === input.expenseId),
      }
    case 'groups.expenses.list': {
      const text = (input.filter ?? '').toLocaleLowerCase()
      const matches = expenses.filter((e) => {
        const date = e.expenseDate.toISOString().slice(0, 10)
        const localDate = `${e.expenseDate.getUTCDate()}.${
          e.expenseDate.getUTCMonth() + 1
        }.${e.expenseDate.getUTCFullYear()}`
        return (
          (!text ||
            [
              e.title,
              e.locationName,
              e.category?.name,
              e.paidBy.name,
              date,
              localDate,
            ].some((s) => s?.toLocaleLowerCase().includes(text))) &&
          (!input.categoryIds?.length ||
            input.categoryIds.includes(e.categoryId)) &&
          (!input.locationName ||
            e.locationName
              ?.toLocaleLowerCase()
              .includes(input.locationName.toLocaleLowerCase())) &&
          (input.minAmount == null || e.amount >= input.minAmount) &&
          (input.maxAmount == null || e.amount <= input.maxAmount) &&
          (!input.participantId ||
            e.paidFor.some((p) => p.participantId === input.participantId)) &&
          (!input.dateFrom || date >= input.dateFrom.slice(0, 10)) &&
          (!input.dateTo || date <= input.dateTo.slice(0, 10))
        )
      })
      return {
        expenses: matches.slice(cursor, cursor + limit),
        hasMore: matches.length > cursor + limit,
        nextCursor: cursor + limit,
      }
    }
    case 'groups.balances.list': {
      const reimbursements = getSuggestedReimbursements(getBalances(expenses))
      return { balances: getPublicBalances(reimbursements), reimbursements }
    }
    case 'groups.stats.get':
      return {
        totalGroupSpendings: getTotalGroupSpending(expenses),
        totalParticipantSpendings: input.participantId
          ? getTotalActiveUserPaidFor(input.participantId, expenses)
          : undefined,
        totalParticipantShare: input.participantId
          ? getTotalActiveUserShare(input.participantId, expenses)
          : undefined,
      }
    case 'groups.stats.dailySpending': {
      const days = new Map<string, number>()
      for (const e of expenses.filter((e) => !e.isReimbursement)) {
        if (
          input.participantId &&
          !e.paidFor.some((p) => p.participantId === input.participantId)
        )
          continue
        const day = e.expenseDate.toISOString().slice(0, 10)
        days.set(
          day,
          (days.get(day) ?? 0) +
            (input.participantId
              ? calculateShare(input.participantId, e)
              : e.amount),
        )
      }
      return {
        days: Array.from(days)
          .map(([date, total]) => ({ date, total: Math.round(total) }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    }
    case 'groups.stats.categoryBreakdown': {
      const categories = new Map<
        number,
        {
          id: number
          grouping: string
          name: string
          total: number
          count: number
        }
      >()
      for (const e of expenses.filter((e) => !e.isReimbursement)) {
        if (
          input.participantId &&
          !e.paidFor.some((p) => p.participantId === input.participantId)
        )
          continue
        const category = categories.get(e.categoryId) ?? {
          id: e.categoryId,
          grouping: e.category?.grouping ?? 'Uncategorized',
          name: e.category?.name ?? 'General',
          total: 0,
          count: 0,
        }
        category.total +=
          (input.participantId
            ? calculateShare(input.participantId, e)
            : e.amount) / 100
        category.count++
        categories.set(e.categoryId, category)
      }
      const values = Array.from(categories.values()).sort(
        (a, b) => b.total - a.total,
      )
      return {
        categories: values,
        grandTotal: values.reduce((n, c) => n + c.total, 0),
      }
    }
    case 'groups.stats.categoryExpenses':
      return expenses
        .filter(
          (e) =>
            !e.isReimbursement &&
            e.categoryId === input.categoryId &&
            (!input.participantId ||
              e.paidFor.some((p) => p.participantId === input.participantId)),
        )
        .map((e) => ({
          id: e.id,
          title: e.title,
          amount:
            (input.participantId
              ? calculateShare(input.participantId, e)
              : e.amount) / 100,
          expenseDate: e.expenseDate,
          paidByName: e.paidBy.name,
        }))
    case 'groups.activities.list':
      return {
        activities: snapshot.activities.slice(cursor, cursor + limit),
        hasMore: snapshot.activities.length > cursor + limit,
        nextCursor: cursor + limit,
      }
    default:
      return undefined
  }
}
