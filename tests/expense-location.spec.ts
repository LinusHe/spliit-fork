import { expect } from '@playwright/test'
import { api, fixture } from './offline-helpers'
import { test } from './offline-network'

test('typing a location keeps the input until done', async ({
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
  await page.locator('input[name="title"]').fill('Café')
  await page.locator('input[name="amount"]').fill('7')
  const location = page.getByPlaceholder('Ort (optional)')
  await location.click()
  // Real keystrokes: the field used to switch to display mode after one.
  await location.pressSequentially('Berlin Mitte', { delay: 30 })
  await expect(location).toHaveValue('Berlin Mitte')
  await expect(location).toBeFocused()
  await page.locator('input[name="title"]').click()
  await expect(page.getByRole('button', { name: 'Berlin Mitte' })).toBeVisible()
  // Editing again continues in the focused input.
  await page.getByRole('button', { name: 'Berlin Mitte' }).click()
  await expect(location).toBeFocused()
  await location.press('End')
  await location.pressSequentially(', Kiez', { delay: 30 })
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()
  await expect
    .poll(
      async () =>
        (
          await api(request, 'offline.snapshot', { groupId: f.groupId })
        ).expenses.find((e: any) => e.title === 'Café')?.locationName,
    )
    .toBe('Berlin Mitte, Kiez')
})
