import { expect, type Page } from '@playwright/test'
import { api, fixture } from './offline-helpers'
import { test } from './offline-network'

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

test('payment currencies set in the group settings', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/edit`)
  const field = page.getByTestId('quick-currencies')
  await field.getByRole('button', { name: 'Währung hinzufügen' }).click()
  await page.getByPlaceholder('Währung suchen...').fill('Albanischer')
  await page.getByRole('option', { name: /Albanischer Lek/ }).click()
  await expect(field).toContainText('ALL')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect
    .poll(
      async () =>
        (await api(request, 'groups.get', { groupId: f.groupId })).group
          .quickCurrencies,
    )
    .toEqual(['ALL'])

  // Adding an expense: EUR preselected, ALL one tap away.
  await page.goto(`/groups/${f.groupId}/expenses/create`)
  const quick = page.getByRole('radiogroup', { name: 'Bezahlt in' })
  await expect(quick.getByRole('radio')).toHaveText([/EUR/, /ALL/])
  await expect(quick.getByRole('radio', { name: /EUR/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await quick.getByRole('radio', { name: /ALL/ }).click()
  await expect(
    page.getByRole('combobox').filter({ hasText: 'Albanischer Lek' }),
  ).toBeVisible()
  await expect(page.locator('input[name="originalAmount"]')).toBeFocused()
  await quick.getByRole('radio', { name: /EUR/ }).click()
  await expect(
    page.getByRole('combobox').filter({ hasText: 'Euro' }),
  ).toBeVisible()
})

test('currencies used in a group are offered first', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await api(
    request,
    'groups.expenses.create',
    {
      groupId: f.groupId,
      expenseFormValues: {
        ...f.values,
        title: 'Souvenir',
        originalCurrency: 'CHF',
        originalAmount: 1000,
        conversionRate: 1,
        amount: 1000,
      },
    },
    true,
  )
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses/create`)
  const quick = page.getByRole('radiogroup', { name: 'Bezahlt in' })
  await expect(quick.getByRole('radio')).toHaveText([/EUR/, /CHF/])
  await page.getByRole('combobox').filter({ hasText: 'Euro' }).click()
  const first = page.getByRole('group', { name: 'In dieser Gruppe' })
  await expect(first.getByRole('option')).toHaveText([/EUR/, /CHF/])
})
