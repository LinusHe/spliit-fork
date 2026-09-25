import { expect } from '@playwright/test'
import { api, fixture } from './offline-helpers'
import { test } from './offline-network'

test('duplicating an expense keeps its split', async ({ page, request }) => {
  const f = await fixture(request)
  const [alice, bob] = f.group.participants
  const { expenseId } = await api(
    request,
    'groups.expenses.create',
    {
      groupId: f.groupId,
      expenseFormValues: {
        ...f.values,
        title: 'Uneven dinner',
        amount: 4000,
        splitMode: 'BY_SHARES',
        paidFor: [
          { participant: alice.id, shares: 1 },
          { participant: bob.id, shares: 3 },
        ],
      },
    },
    true,
  )
  const original = (
    await api(request, 'groups.expenses.get', { groupId: f.groupId, expenseId })
  ).expense
  await page.addInitScript(
    ({ groupId, participantId }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId: f.groupId, participantId: alice.id },
  )
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page.getByText('Uneven dinner', { exact: true }).click()
  await page.getByTitle('Duplizieren').click()
  await expect(page.locator('input[name="title"]')).toHaveValue('Uneven dinner')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()

  const copy = async () =>
    (
      await api(request, 'offline.snapshot', { groupId: f.groupId })
    ).expenses.filter(
      (e: any) => e.title === 'Uneven dinner' && e.id !== expenseId,
    )
  await expect.poll(async () => (await copy()).length).toBe(1)
  const copies = await copy()
  const shares = (e: any) =>
    e.paidFor
      .map((p: any) => [p.participantId, p.shares])
      .sort((a: any, b: any) => a[0].localeCompare(b[0]))
  expect(copies[0].splitMode).toBe('BY_SHARES')
  expect(shares(copies[0])).toEqual(shares(original))
  expect(copies[0].amount).toBe(4000)
})
