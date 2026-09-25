import {
  getBalances,
  getPublicBalances,
  getSuggestedReimbursements,
} from '@/lib/balances'
import { getPresetCategoryIds } from '@/lib/category-presets'
import { prisma } from '@/lib/prisma'
import { ExpenseFormValues, GroupFormValues } from '@/lib/schemas'
import {
  ActivityType,
  Expense,
  RecurrenceRule,
  RecurringExpenseLink,
  Prisma,
} from '@prisma/client'
import { nanoid } from 'nanoid'

export function randomId() {
  return nanoid()
}

export async function createGroup(groupFormValues: GroupFormValues) {
  const categoryIds =
    groupFormValues.categoryIds.length > 0
      ? groupFormValues.categoryIds
      : getPresetCategoryIds(groupFormValues.categoryPreset)

  return prisma.group.create({
    data: {
      id: randomId(),
      name: groupFormValues.name,
      information: groupFormValues.information,
      currency: groupFormValues.currency,
      currencyCode: groupFormValues.currencyCode,
      quickCurrencies: groupFormValues.quickCurrencies,
      categoryPreset: groupFormValues.categoryPreset,
      categorySelections: {
        createMany: {
          data: categoryIds.map((categoryId) => ({ categoryId })),
          skipDuplicates: true,
        },
      },
      participants: {
        createMany: {
          data: groupFormValues.participants.map(({ name }) => ({
            id: randomId(),
            name,
          })),
        },
      },
    },
    include: { participants: true },
  })
}

export async function createExpense(
  expenseFormValues: ExpenseFormValues,
  groupId: string,
  participantId?: string,
  db: Prisma.TransactionClient = prisma,
  expenseId = randomId(),
  syncVersion = randomId(),
): Promise<Expense> {
  const group = await getGroup(groupId, db)
  if (!group) throw new Error(`Invalid group ID: ${groupId}`)

  for (const participant of [
    expenseFormValues.paidBy,
    ...expenseFormValues.paidFor.map((p) => p.participant),
  ]) {
    if (!group.participants.some((p) => p.id === participant))
      throw new Error(`Invalid participant ID: ${participant}`)
  }

  await logActivity(groupId, ActivityType.CREATE_EXPENSE, {
    participantId,
    expenseId,
    data: expenseFormValues.title,
  }, db)

  const isCreateRecurrence =
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE
  const recurringExpenseLinkPayload = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  return db.expense.create({
    data: {
      id: expenseId,
      syncVersion,
      groupId,
      expenseDate: expenseFormValues.expenseDate,
      categoryId: expenseFormValues.category,
      amount: expenseFormValues.amount,
      originalAmount: expenseFormValues.originalAmount,
      originalCurrency: expenseFormValues.originalCurrency,
      conversionRate: expenseFormValues.conversionRate,
      title: expenseFormValues.title,
      paidById: expenseFormValues.paidBy,
      splitMode: expenseFormValues.splitMode,
      recurrenceRule: expenseFormValues.recurrenceRule,
      recurringExpenseLink: {
        ...(isCreateRecurrence
          ? {
              create: recurringExpenseLinkPayload,
            }
          : {}),
      },
      paidFor: {
        createMany: {
          data: expenseFormValues.paidFor.map((paidFor) => ({
            participantId: paidFor.participant,
            shares: paidFor.shares,
          })),
        },
      },
      isReimbursement: expenseFormValues.isReimbursement,
      documents: {
        createMany: {
          data: expenseFormValues.documents.map((doc) => ({
            id: randomId(),
            url: doc.url,
            width: doc.width,
            height: doc.height,
          })),
        },
      },
      notes: expenseFormValues.notes,
      locationName: expenseFormValues.locationName || null,
      latitude: expenseFormValues.latitude ?? null,
      longitude: expenseFormValues.longitude ?? null,
    },
  })
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  participantId?: string,
  db: Prisma.TransactionClient = prisma,
) {
  const existingExpense = await getExpense(groupId, expenseId, db)
  await logActivity(groupId, ActivityType.DELETE_EXPENSE, {
    participantId,
    expenseId,
    data: existingExpense?.title,
  }, db)

  await db.expense.delete({
    where: { id: expenseId, groupId },
    include: { paidFor: true, paidBy: true },
  })
}

export async function getGroupExpensesParticipants(groupId: string) {
  const expenses = await getGroupExpenses(groupId)
  return Array.from(
    new Set(
      expenses.flatMap((e) => [
        e.paidBy.id,
        ...e.paidFor.map((pf) => pf.participant.id),
      ]),
    ),
  )
}

export async function getGroups(groupIds: string[]) {
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    include: { _count: { select: { participants: true } } },
  })

  return Promise.all(
    groups.map(async (group) => {
      const balances = getBalances(await getGroupExpenses(group.id))
      const reimbursements = getSuggestedReimbursements(balances)
      const publicBalances = getPublicBalances(reimbursements)

      return {
        ...group,
        createdAt: group.createdAt.toISOString(),
        balances: publicBalances,
      }
    }),
  )
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  expenseFormValues: ExpenseFormValues,
  participantId?: string,
  db: Prisma.TransactionClient = prisma,
  syncVersion = randomId(),
) {
  const group = await getGroup(groupId, db)
  if (!group) throw new Error(`Invalid group ID: ${groupId}`)

  const existingExpense = await getExpense(groupId, expenseId, db)
  if (!existingExpense) throw new Error(`Invalid expense ID: ${expenseId}`)

  for (const participant of [
    expenseFormValues.paidBy,
    ...expenseFormValues.paidFor.map((p) => p.participant),
  ]) {
    if (!group.participants.some((p) => p.id === participant))
      throw new Error(`Invalid participant ID: ${participant}`)
  }

  await logActivity(groupId, ActivityType.UPDATE_EXPENSE, {
    participantId,
    expenseId,
    data: expenseFormValues.title,
  }, db)

  const isDeleteRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule === RecurrenceRule.NONE &&
    // Delete the existing RecurrenceExpenseLink only if it has not been acted upon yet
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null

  const isUpdateRecurrenceExpenseLink =
    existingExpense.recurrenceRule !== expenseFormValues.recurrenceRule &&
    // Update the exisiting RecurrenceExpenseLink only if it has not been acted upon yet
    existingExpense.recurringExpenseLink?.nextExpenseCreatedAt === null
  const isCreateRecurrenceExpenseLink =
    existingExpense.recurrenceRule === RecurrenceRule.NONE &&
    expenseFormValues.recurrenceRule !== RecurrenceRule.NONE &&
    // Create a new RecurrenceExpenseLink only if one does not already exist for the expense
    existingExpense.recurringExpenseLink === null

  const newRecurringExpenseLink = createPayloadForNewRecurringExpenseLink(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    expenseFormValues.expenseDate,
    groupId,
  )

  const updatedRecurrenceExpenseLinkNextExpenseDate = calculateNextDate(
    expenseFormValues.recurrenceRule as RecurrenceRule,
    existingExpense.expenseDate,
  )

  return db.expense.update({
    where: { id: expenseId, groupId },
    data: {
      syncVersion,
      expenseDate: expenseFormValues.expenseDate,
      amount: expenseFormValues.amount,
      originalAmount: expenseFormValues.originalAmount,
      originalCurrency: expenseFormValues.originalCurrency,
      conversionRate: expenseFormValues.conversionRate,
      title: expenseFormValues.title,
      categoryId: expenseFormValues.category,
      paidById: expenseFormValues.paidBy,
      splitMode: expenseFormValues.splitMode,
      recurrenceRule: expenseFormValues.recurrenceRule,
      paidFor: {
        create: expenseFormValues.paidFor
          .filter(
            (p) =>
              !existingExpense.paidFor.some(
                (pp) => pp.participantId === p.participant,
              ),
          )
          .map((paidFor) => ({
            participantId: paidFor.participant,
            shares: paidFor.shares,
          })),
        update: expenseFormValues.paidFor.filter((p) => existingExpense.paidFor.some((old) => old.participantId === p.participant)).map((paidFor) => ({
          where: {
            expenseId_participantId: {
              expenseId,
              participantId: paidFor.participant,
            },
          },
          data: {
            shares: paidFor.shares,
            // The form asked whether a changed, already paid share stays paid.
            ...(expenseFormValues.unsettleParticipantIds?.includes(
              paidFor.participant,
            )
              ? { settledAt: null }
              : {}),
          },
        })),
        deleteMany: existingExpense.paidFor.filter(
          (paidFor) =>
            !expenseFormValues.paidFor.some(
              (pf) => pf.participant === paidFor.participantId,
            ),
        ),
      },
      recurringExpenseLink: {
        ...(isCreateRecurrenceExpenseLink
          ? {
              create: newRecurringExpenseLink,
            }
          : {}),
        ...(isUpdateRecurrenceExpenseLink
          ? {
              update: {
                nextExpenseDate: updatedRecurrenceExpenseLinkNextExpenseDate,
              },
            }
          : {}),
        delete: isDeleteRecurrenceExpenseLink,
      },
      isReimbursement: expenseFormValues.isReimbursement,
      documents: {
        connectOrCreate: expenseFormValues.documents.map((doc) => ({
          create: doc,
          where: { id: doc.id },
        })),
        deleteMany: existingExpense.documents
          .filter(
            (existingDoc) =>
              !expenseFormValues.documents.some(
                (doc) => doc.id === existingDoc.id,
              ),
          )
          .map((doc) => ({
            id: doc.id,
          })),
      },
      notes: expenseFormValues.notes,
      locationName: expenseFormValues.locationName || null,
      latitude: expenseFormValues.latitude ?? null,
      longitude: expenseFormValues.longitude ?? null,
    },
  })
}

/**
 * Marks participants' shares of an expense as already paid back to the payer
 * (or open again). The payer's own share and unknown participants are
 * ignored. Returns null if the expense no longer exists.
 */
export async function settleExpenseShares(
  groupId: string,
  expenseId: string,
  participantIds: string[],
  settled: boolean,
  activeParticipantId?: string,
  db: Prisma.TransactionClient = prisma,
  syncVersion = randomId(),
) {
  const expense = await getExpense(groupId, expenseId, db)
  if (!expense) return null
  const ids = expense.paidFor
    .map((p) => p.participantId)
    .filter((id) => participantIds.includes(id) && id !== expense.paidById)
  if (!ids.length) return expense
  await db.expensePaidFor.updateMany({
    where: { expenseId, participantId: { in: ids } },
    data: { settledAt: settled ? new Date() : null },
  })
  const group = await getGroup(groupId, db)
  await logActivity(
    groupId,
    settled ? ActivityType.SETTLE_EXPENSE : ActivityType.UNSETTLE_EXPENSE,
    {
      participantId: activeParticipantId,
      expenseId,
      data: JSON.stringify({
        title: expense.title,
        names: ids.map(
          (id) => group?.participants.find((p) => p.id === id)?.name ?? '',
        ),
      }),
    },
    db,
  )
  return db.expense.update({
    where: { id: expenseId, groupId },
    data: { syncVersion },
  })
}

export async function updateGroup(
  groupId: string,
  groupFormValues: GroupFormValues,
  participantId?: string,
) {
  const existingGroup = await getGroup(groupId)
  if (!existingGroup) throw new Error('Invalid group ID')

  await logActivity(groupId, ActivityType.UPDATE_GROUP, { participantId })
  const categoryIds =
    groupFormValues.categoryIds.length > 0
      ? groupFormValues.categoryIds
      : getPresetCategoryIds(groupFormValues.categoryPreset)

  return prisma.group.update({
    where: { id: groupId },
    data: {
      name: groupFormValues.name,
      information: groupFormValues.information,
      currency: groupFormValues.currency,
      currencyCode: groupFormValues.currencyCode,
      quickCurrencies: groupFormValues.quickCurrencies,
      categoryPreset: groupFormValues.categoryPreset,
      categorySelections: {
        deleteMany: {},
        createMany: {
          data: categoryIds.map((categoryId) => ({ categoryId })),
          skipDuplicates: true,
        },
      },
      participants: {
        deleteMany: existingGroup.participants.filter(
          (p) => !groupFormValues.participants.some((p2) => p2.id === p.id),
        ),
        updateMany: groupFormValues.participants
          .filter((participant) => participant.id !== undefined)
          .map((participant) => ({
            where: { id: participant.id },
            data: {
              name: participant.name,
            },
          })),
        createMany: {
          data: groupFormValues.participants
            .filter((participant) => participant.id === undefined)
            .map((participant) => ({
              id: randomId(),
              name: participant.name,
            })),
        },
      },
    },
  })
}

export async function getGroup(groupId: string, db: Prisma.TransactionClient = prisma) {
  return db.group.findUnique({
    where: { id: groupId },
    include: { participants: true, categorySelections: true },
  })
}

export async function getCategories() {
  return prisma.category.findMany()
}

export async function getCategoriesForGroup(groupId?: string) {
  if (!groupId) return getCategories()

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { categorySelections: true },
  })
  const categoryIds = group?.categorySelections.map(
    (selection) => selection.categoryId,
  )

  if (!categoryIds || categoryIds.length === 0) return getCategories()

  return prisma.category.findMany({
    where: { id: { in: categoryIds } },
    orderBy: { id: 'asc' },
  })
}

export async function getGroupExpenses(
  groupId: string,
  options?: {
    offset?: number
    length?: number
    filter?: string
    categoryIds?: number[]
    locationName?: string
    minAmount?: number
    maxAmount?: number
    participantId?: string
    dateFrom?: Date
    dateTo?: Date
  },
) {
  await createRecurringExpenses()

  const textFilter = options?.filter
  const where: any = { groupId }

  // Freitext search: match title, locationName, category name, paidBy name, or date
  if (textFilter) {
    const orConditions: any[] = [
      { title: { contains: textFilter, mode: 'insensitive' } },
      { locationName: { contains: textFilter, mode: 'insensitive' } },
      { category: { name: { contains: textFilter, mode: 'insensitive' } } },
      { paidBy: { name: { contains: textFilter, mode: 'insensitive' } } },
    ]

    // Try to parse date from text (DD.MM.YYYY, DD.MM.YY, DD.MM., DD.M.)
    const dateMatch = textFilter.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?$/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10)
      const month = parseInt(dateMatch[2], 10)
      const yearStr = dateMatch[3]
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        if (yearStr) {
          const year =
            yearStr.length === 2
              ? 2000 + parseInt(yearStr, 10)
              : parseInt(yearStr, 10)
          const d = new Date(year, month - 1, day)
          const next = new Date(year, month - 1, day + 1)
          orConditions.push({
            expenseDate: { gte: d, lt: next },
          })
        } else {
          // No year → match in current year
          const year = new Date().getFullYear()
          const d = new Date(year, month - 1, day)
          const next = new Date(year, month - 1, day + 1)
          orConditions.push({
            expenseDate: { gte: d, lt: next },
          })
        }
      }
    }

    where.OR = orConditions
  }

  // Structured filters
  if (options?.categoryIds && options.categoryIds.length > 0) {
    where.categoryId = { in: options.categoryIds }
  }
  if (options?.locationName) {
    where.locationName = { contains: options.locationName, mode: 'insensitive' }
  }
  if (options?.minAmount !== undefined || options?.maxAmount !== undefined) {
    where.amount = {}
    if (options?.minAmount !== undefined) where.amount.gte = options.minAmount
    if (options?.maxAmount !== undefined) where.amount.lte = options.maxAmount
  }
  if (options?.participantId) {
    where.paidFor = {
      some: { participantId: options.participantId },
    }
  }
  if (options?.dateFrom || options?.dateTo) {
    where.expenseDate = {}
    if (options?.dateFrom) where.expenseDate.gte = options.dateFrom
    if (options?.dateTo) where.expenseDate.lte = options.dateTo
  }

  return prisma.expense.findMany({
    select: {
      amount: true,
      category: true,
      createdAt: true,
      expenseDate: true,
      id: true,
      isReimbursement: true,
      locationName: true,
      paidBy: { select: { id: true, name: true } },
      paidFor: {
        select: {
          participant: { select: { id: true, name: true } },
          shares: true,
          settledAt: true,
        },
      },
      splitMode: true,
      recurrenceRule: true,
      title: true,
      _count: { select: { documents: true } },
    },
    where,
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    skip: options && options.offset,
    take: options && options.length,
  })
}

export async function getGroupExpenseCount(groupId: string) {
  return prisma.expense.count({ where: { groupId } })
}

export async function getExpense(groupId: string, expenseId: string, db: Prisma.TransactionClient = prisma) {
  return db.expense.findUnique({
    where: { id: expenseId, groupId },
    include: {
      paidBy: true,
      paidFor: true,
      category: true,
      documents: true,
      recurringExpenseLink: true,
    },
  })
}

export async function getActivities(
  groupId: string,
  options?: { offset?: number; length?: number },
) {
  const activities = await prisma.activity.findMany({
    where: { groupId },
    orderBy: [{ time: 'desc' }],
    skip: options?.offset,
    take: options?.length,
  })

  const expenseIds = activities
    .map((activity) => activity.expenseId)
    .filter(Boolean)
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      id: { in: expenseIds },
    },
  })

  return activities.map((activity) => ({
    ...activity,
    expense:
      activity.expenseId !== null
        ? expenses.find((expense) => expense.id === activity.expenseId)
        : undefined,
  }))
}

export async function logActivity(
  groupId: string,
  activityType: ActivityType,
  extra?: { participantId?: string; expenseId?: string; data?: string },
  db: Prisma.TransactionClient = prisma,
) {
  return db.activity.create({
    data: {
      id: randomId(),
      groupId,
      activityType,
      ...extra,
    },
  })
}

async function createRecurringExpenses() {
  const localDate = new Date() // Current local date
  const utcDateFromLocal = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      // More precision beyond date is required to ensure that recurring Expenses are created within <most precises unit> of when expected
      localDate.getUTCHours(),
      localDate.getUTCMinutes(),
    ),
  )

  const recurringExpenseLinksWithExpensesToCreate =
    await prisma.recurringExpenseLink.findMany({
      where: {
        nextExpenseCreatedAt: null,
        nextExpenseDate: {
          lte: utcDateFromLocal,
        },
      },
      include: {
        currentFrameExpense: {
          include: {
            paidBy: true,
            paidFor: true,
            category: true,
            documents: true,
          },
        },
      },
    })

  for (const recurringExpenseLink of recurringExpenseLinksWithExpensesToCreate) {
    let newExpenseDate = recurringExpenseLink.nextExpenseDate

    let currentExpenseRecord = recurringExpenseLink.currentFrameExpense
    let currentReccuringExpenseLinkId = recurringExpenseLink.id

    while (newExpenseDate < utcDateFromLocal) {
      const newExpenseId = randomId()
      const newRecurringExpenseLinkId = randomId()

      const newRecurringExpenseNextExpenseDate = calculateNextDate(
        currentExpenseRecord.recurrenceRule as RecurrenceRule,
        newExpenseDate,
      )

      const {
        category,
        paidBy,
        paidFor,
        documents,
        ...destructeredCurrentExpenseRecord
      } = currentExpenseRecord

      // Use a transacton to ensure that the only one expense is created for the RecurringExpenseLink
      // just in case two clients are processing the same RecurringExpenseLink at the same time
      const newExpense = await prisma
        .$transaction(async (transaction) => {
          const newExpense = await transaction.expense.create({
            data: {
              ...destructeredCurrentExpenseRecord,
              categoryId: currentExpenseRecord.categoryId,
              paidById: currentExpenseRecord.paidById,
              paidFor: {
                createMany: {
                  data: currentExpenseRecord.paidFor.map((paidFor) => ({
                    participantId: paidFor.participantId,
                    shares: paidFor.shares,
                  })),
                },
              },
              documents: {
                connect: currentExpenseRecord.documents.map(
                  (documentRecord) => ({
                    id: documentRecord.id,
                  }),
                ),
              },
              id: newExpenseId,
              expenseDate: newExpenseDate,
              recurringExpenseLink: {
                create: {
                  groupId: currentExpenseRecord.groupId,
                  id: newRecurringExpenseLinkId,
                  nextExpenseDate: newRecurringExpenseNextExpenseDate,
                },
              },
            },
            // Ensure that the same information is available on the returned record that was created
            include: {
              paidFor: true,
              documents: true,
              category: true,
              paidBy: true,
            },
          })

          // Mark the RecurringExpenseLink as being "completed" since the new Expense was created
          // if an expense hasn't been created for this RecurringExpenseLink yet
          await transaction.recurringExpenseLink.update({
            where: {
              id: currentReccuringExpenseLinkId,
              nextExpenseCreatedAt: null,
            },
            data: {
              nextExpenseCreatedAt: newExpense.createdAt,
            },
          })

          return newExpense
        })
        .catch(() => {
          console.error(
            'Failed to created recurringExpense for expenseId: %s',
            currentExpenseRecord.id,
          )
          return null
        })

      // If the new expense failed to be created, break out of the while-loop
      if (newExpense === null) break

      // Set the values for the next iteration of the for-loop in case multiple recurring Expenses need to be created
      currentExpenseRecord = newExpense
      currentReccuringExpenseLinkId = newRecurringExpenseLinkId
      newExpenseDate = newRecurringExpenseNextExpenseDate
    }
  }
}

function createPayloadForNewRecurringExpenseLink(
  recurrenceRule: RecurrenceRule,
  priorDateToNextRecurrence: Date,
  groupId: String,
): RecurringExpenseLink {
  const nextExpenseDate = calculateNextDate(
    recurrenceRule,
    priorDateToNextRecurrence,
  )

  const recurringExpenseLinkId = randomId()
  const recurringExpenseLinkPayload = {
    id: recurringExpenseLinkId,
    groupId: groupId,
    nextExpenseDate: nextExpenseDate,
  }

  return recurringExpenseLinkPayload as RecurringExpenseLink
}

// TODO: Modify this function to use a more comprehensive recurrence Rule library like rrule (https://github.com/jkbrzt/rrule)
//
// Current limitations:
// - If a date is intended to be repeated monthly on the 29th, 30th or 31st, it will change to repeating on the smallest
// date that the reccurence has encountered. Ex. If a recurrence is created for Jan 31st on 2025, the recurring expense
// will be created for Feb 28th, March 28, etc. until it is cancelled or fixed
function calculateNextDate(
  recurrenceRule: RecurrenceRule,
  priorDateToNextRecurrence: Date,
): Date {
  const nextDate = new Date(priorDateToNextRecurrence)
  switch (recurrenceRule) {
    case RecurrenceRule.DAILY:
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      break
    case RecurrenceRule.WEEKLY:
      nextDate.setUTCDate(nextDate.getUTCDate() + 7)
      break
    case RecurrenceRule.MONTHLY:
      const nextYear = nextDate.getUTCFullYear()
      const nextMonth = nextDate.getUTCMonth() + 1
      let nextDay = nextDate.getUTCDate()

      // Reduce the next day until it is within the direct next month
      while (!isDateInNextMonth(nextYear, nextMonth, nextDay)) {
        nextDay -= 1
      }
      nextDate.setUTCMonth(nextMonth, nextDay)
      break
  }

  return nextDate
}

function isDateInNextMonth(
  utcYear: number,
  utcMonth: number,
  utcDate: number,
): Boolean {
  const testDate = new Date(Date.UTC(utcYear, utcMonth, utcDate))

  // We're not concerned if the year or month changes. We only want to make sure that the date is our target date
  if (testDate.getUTCDate() !== utcDate) {
    return false
  }

  return true
}
