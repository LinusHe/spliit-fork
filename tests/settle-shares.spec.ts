import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { api, fixture, openGroup } from './offline-helpers'
import { test } from './offline-network'

// Shares marked as "already paid back" directly in an expense, instead of a
// separate reimbursement entry.

type Fixture = Awaited<ReturnType<typeof fixture>>

async function asAlice(page: Page, f: Fixture) {
  await page.addInitScript(
    ({ groupId, participantId }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId: f.groupId, participantId: f.group.participants[0].id },
  )
}

async function bobSettled(request: APIRequestContext, f: Fixture) {
  const { expense } = await api(request, 'groups.expenses.get', {
    groupId: f.groupId,
    expenseId: f.expenseId,
  })
  const bob = f.group.participants[1].id
  return !!expense.paidFor.find((p: any) => p.participantId === bob)?.settledAt
}

const settleSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Bob hat zurückgezahlt' })

test('marking a share as paid settles it everywhere', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page.getByText('Original Dinner', { exact: true }).click()
  const section = page.getByTestId('settle-shares')
  await expect(section).toContainText('Schon zurückgezahlt?')
  await expect(section).toContainText(/Bob\s*\(12,00/)
  await settleSwitch(page).click()
  await expect(section).toContainText('Alle haben zurückgezahlt')
  await expect.poll(() => bobSettled(request, f)).toBe(true)

  // Balances: nothing left to settle, the direct payment is listed.
  const { reimbursements, settlements } = await api(
    request,
    'groups.balances.list',
    { groupId: f.groupId },
  )
  expect(reimbursements).toEqual([])
  expect(settlements).toEqual([
    {
      from: f.group.participants[1].id,
      to: f.group.participants[0].id,
      amount: 1200,
      expenses: 1,
    },
  ])

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settled-badge')).toHaveText('Zurückgezahlt')
  await page.goto(`/groups/${f.groupId}/balances`)
  await expect(page.getByTestId('direct-settlements')).toContainText(
    'Bob → Alice',
  )
  await expect(page.getByTestId('direct-settlements')).toContainText('12,00')
  await page.goto(`/groups/${f.groupId}/activity`)
  await expect(
    page.getByText(
      /hat den Anteil von Bob bei .*Original Dinner.* als zurückgezahlt markiert/,
    ),
  ).toBeVisible()
})

test('a manual reimbursement mentions what was already paid back', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  const [alice, bob] = f.group.participants
  await api(
    request,
    'groups.expenses.settle',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      participantIds: [bob.id],
      settled: true,
    },
    true,
  )
  await asAlice(page, f)
  await page.goto(
    `/groups/${f.groupId}/expenses/create?reimbursement=1&from=${bob.id}&to=${alice.id}&amount=1200`,
  )
  await expect(page.getByTestId('settled-hint')).toContainText(
    'Bob hat Alice bereits 12,00',
  )
})

test('settling and then editing in the same drawer does not conflict', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page.getByText('Original Dinner', { exact: true }).click()
  await settleSwitch(page).click()
  await expect(page.getByTestId('settle-shares')).toContainText(
    'Alle haben zurückgezahlt',
  )
  await page.locator('input[name="title"]').fill('Renamed Dinner')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()
  await expect(
    page.getByRole('heading', {
      name: 'Diese Ausgabe wurde auch online geändert',
    }),
  ).not.toBeVisible()
  await expect
    .poll(async () => {
      const { expense } = await api(request, 'groups.expenses.get', {
        groupId: f.groupId,
        expenseId: f.expenseId,
      })
      return expense.title
    })
    .toBe('Renamed Dinner')
  expect(await bobSettled(request, f)).toBe(true)
})

test('changing a paid-back share asks whether it stays paid', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await api(
    request,
    'groups.expenses.settle',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      participantIds: [f.group.participants[1].id],
      settled: true,
    },
    true,
  )
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page.getByText('Original Dinner', { exact: true }).click()
  await page.locator('input[name="amount"]').fill('30')
  await page.locator('button[type="submit"]').click()
  const dialog = page.getByRole('dialog', {
    name: 'Bereits zurückgezahlte Anteile ändern sich',
  })
  await expect(dialog).toContainText('Der Anteil von Bob ändert sich')
  await dialog
    .getByRole('button', { name: 'Wieder als offen markieren' })
    .click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()
  await expect.poll(() => bobSettled(request, f)).toBe(false)
  const { expense } = await api(request, 'groups.expenses.get', {
    groupId: f.groupId,
    expenseId: f.expenseId,
  })
  expect(expense.amount).toBe(3000)
})

test('shares can be marked as paid offline and sync later', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page.reload()
  await page.getByText('Original Dinner', { exact: true }).click()
  await settleSwitch(page).click()
  await expect(page.getByTestId('settle-shares')).toContainText(
    'Alle haben zurückgezahlt',
  )
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByTestId('settled-badge')).toHaveText('Zurückgezahlt')
  expect(await bobSettled(request, f)).toBe(false)
  await network.setOffline(context, false)
  await expect.poll(() => bobSettled(request, f)).toBe(true)
})
