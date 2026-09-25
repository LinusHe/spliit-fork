import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { api } from './offline-helpers'
import { test } from './offline-network'

// Regressions for fixes ported from upstream spliit.

async function group(request: APIRequestContext, name = 'Upstream Fixes') {
  const { groupId } = await api(
    request,
    'groups.create',
    {
      groupFormValues: {
        name,
        currency: '€',
        currencyCode: 'EUR',
        participants: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
      },
    },
    true,
  )
  const { group } = await api(request, 'groups.get', { groupId })
  const [alice, bob, carol] = group.participants
  return { groupId, alice, bob, carol }
}

const baseValues = {
  expenseDate: new Date('2026-09-17T00:00:00Z'),
  category: 0,
  isReimbursement: false,
  saveDefaultSplittingOptions: false,
  documents: [],
  recurrenceRule: 'NONE',
  notes: '',
}

async function open(page: Page, groupId: string, activeUser: string) {
  await page.addInitScript(
    ({ groupId, activeUser }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, activeUser)
    },
    { groupId, activeUser },
  )
}

const shareInput = (page: Page, participantId: string) =>
  page.locator(`[data-id^="${participantId}/"] input[type="text"]`).last()

async function stored(
  request: APIRequestContext,
  groupId: string,
  expenseId: string,
) {
  const { expense } = await api(request, 'groups.expenses.get', {
    groupId,
    expenseId,
  })
  return expense
}

// upstream #638: the edit form rebalanced by-amount shares on load.
test('by-amount shares survive reopening and saving untouched', async ({
  page,
  request,
}) => {
  const g = await group(request)
  const { expenseId } = await api(
    request,
    'groups.expenses.create',
    {
      groupId: g.groupId,
      expenseFormValues: {
        ...baseValues,
        title: 'Uneven by amount',
        amount: 6000,
        paidBy: g.alice.id,
        splitMode: 'BY_AMOUNT',
        paidFor: [
          { participant: g.alice.id, shares: 4000 },
          { participant: g.bob.id, shares: 2000 },
        ],
      },
    },
    true,
  )
  await open(page, g.groupId, g.alice.id)
  await page.goto(`/groups/${g.groupId}/expenses/${expenseId}/edit`)
  await expect(page.locator('input[name="title"]')).toHaveValue(
    'Uneven by amount',
  )
  await page.waitForTimeout(500)
  await expect(shareInput(page, g.alice.id)).toHaveValue(/^40(\.00?)?$/)
  await expect(shareInput(page, g.bob.id)).toHaveValue(/^20(\.00?)?$/)
  await page.locator('button[type="submit"]').click()
  await expect
    .poll(async () =>
      (await stored(request, g.groupId, expenseId)).paidFor
        .map((p: any) => p.shares)
        .sort(),
    )
    .toEqual([2000, 4000])
})

// upstream #638, second case: every converted by-amount expense.
test('converted by-amount shares survive reopening', async ({
  page,
  request,
}) => {
  const g = await group(request)
  const { expenseId } = await api(
    request,
    'groups.expenses.create',
    {
      groupId: g.groupId,
      expenseFormValues: {
        ...baseValues,
        title: 'Converted by amount',
        amount: 6000,
        originalCurrency: 'USD',
        originalAmount: 12000,
        conversionRate: 0.5,
        paidBy: g.alice.id,
        splitMode: 'BY_AMOUNT',
        paidFor: [
          { participant: g.alice.id, shares: 1000 },
          { participant: g.bob.id, shares: 2000 },
          { participant: g.carol.id, shares: 3000 },
        ],
      },
    },
    true,
  )
  await open(page, g.groupId, g.alice.id)
  await page.goto(`/groups/${g.groupId}/expenses/${expenseId}/edit`)
  await expect(page.locator('input[name="title"]')).toHaveValue(
    'Converted by amount',
  )
  await page.waitForTimeout(500)
  await expect(shareInput(page, g.alice.id)).toHaveValue(/^10(\.00?)?$/)
  await expect(shareInput(page, g.carol.id)).toHaveValue(/^30(\.00?)?$/)
})

// upstream #425: originalAmount is an Int column (minor units).
test('foreign amount with decimals can be saved and reopened', async ({
  page,
  request,
}) => {
  const g = await group(request)
  await open(page, g.groupId, g.alice.id)
  await page.goto(`/groups/${g.groupId}/expenses/create`)
  await page.locator('input[name="title"]').fill('Souvenir')
  await page.getByRole('combobox').filter({ hasText: 'EUR' }).click()
  await page.getByPlaceholder('Währung suchen...').fill('USD')
  await page.getByRole('option', { name: /US-Dollar/ }).click()
  await page.getByRole('button', { name: 'Eigenen Kurs verwenden' }).click()
  await page.locator('input[name="conversionRate"]').fill('0.5')
  await page.locator('input[name="originalAmount"]').fill('12.50')
  await expect(page.locator('input[name="amount"]')).toHaveValue(/^6\.25$/)
  await page.locator('button[type="submit"]').click()
  let expenseId = ''
  await expect
    .poll(async () => {
      const { expenses } = await api(request, 'offline.snapshot', {
        groupId: g.groupId,
      })
      expenseId = expenses.find((e: any) => e.title === 'Souvenir')?.id ?? ''
      return expenseId
    })
    .not.toBe('')
  const expense = await stored(request, g.groupId, expenseId)
  expect(expense.originalAmount).toBe(1250)
  expect(expense.amount).toBe(625)
  await page.goto(`/groups/${g.groupId}/expenses/${expenseId}/edit`)
  await expect(page.locator('input[name="originalAmount"]')).toHaveValue(
    /^12\.50?$/,
  )
})

// upstream #377: non-ASCII group names broke the CSV download header.
test('CSV export works for group names with umlauts', async ({ request }) => {
  const g = await group(request, 'Düsseldorf Straßenfest')
  const response = await request.get(`/groups/${g.groupId}/expenses/export/csv`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toContain('filename*=')
})

// upstream #491: arrow keys and Enter in the desktop pickers.
test('category picker is keyboard navigable on desktop', async ({
  page,
  request,
}) => {
  const g = await group(request)
  await open(page, g.groupId, g.alice.id)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/groups/${g.groupId}/expenses/create`)
  await page.getByRole('combobox').filter({ hasText: 'Allgemein' }).click()
  await page.getByPlaceholder('Nach Kategorie suchen...').fill('Lebensm')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('combobox').filter({ hasText: 'Lebensmittel' }),
  ).toBeVisible()
})
