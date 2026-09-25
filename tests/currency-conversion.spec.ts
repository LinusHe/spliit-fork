import { expect } from '@playwright/test'
import { fixture } from './offline-helpers'
import { test } from './offline-network'

// Uses the real Frankfurter API (api.frankfurter.dev).
test('foreign currency rate is fetched, including Albanian lek', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  await page.addInitScript(
    ({ groupId, participantId }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId: f.groupId, participantId: f.group.participants[0].id },
  )
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page
    .getByRole('button', { name: 'Ausgabe hinzufügen', exact: true })
    .click()
  await page.locator('input[name="title"]').fill('Byrek')
  const currency = page.getByRole('combobox').filter({ hasText: 'EUR' })
  await currency.click()
  await page.getByPlaceholder('Währung suchen...').fill('Albanischer')
  await page.getByRole('option', { name: /Albanischer Lek/ }).click()
  await expect(
    page.getByRole('combobox').filter({ hasText: 'Albanischer Lek' }),
  ).toBeVisible()
  await expect(
    // Today's lek rate may not be published yet: then yesterday's is used.
    page.getByText(/Kurs:? ALL\s1\s=\sEUR\s0\.0\d+/),
  ).toBeVisible()
  await page.locator('input[name="originalAmount"]').fill('1000')
  // ~91 lek per euro: 1000 lek are roughly 10–12 euros.
  await expect
    .poll(async () =>
      Number(await page.locator('input[name="amount"]').inputValue()),
    )
    .toBeGreaterThan(9)
  expect(
    Number(await page.locator('input[name="amount"]').inputValue()),
  ).toBeLessThan(13)
})
