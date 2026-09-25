import { devices, expect } from '@playwright/test'
import { fixture } from './offline-helpers'
import { test } from './offline-network'

// Pickers open on top of the expense drawer. As a second vaul drawer they
// pinned the body on iOS (the drawer below jumped) and swallowed taps.
for (const device of ['iPhone 13', 'Pixel 7'] as const) {
  test.describe(device, () => {
    const { defaultBrowserType, ...emulation } = devices[device]
    test.use(emulation)

    test(`category picker in the expense drawer (${device})`, async ({
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
        .tap()
      await expect(page.locator('input[name="title"]')).toBeVisible()
      const drawer = page.getByRole('dialog').first()
      await page.waitForTimeout(600)
      const before = await drawer.boundingBox()

      const combo = page.getByRole('combobox').filter({ hasText: 'Allgemein' })
      await combo.scrollIntoViewIfNeeded()
      await combo.tap()
      const sheet = page.getByRole('dialog', { name: 'Kategorie' })
      await expect(sheet).toBeVisible()
      // No keyboard pops up and the page underneath stays where it is.
      await expect(sheet.getByRole('combobox')).not.toBeFocused()
      expect(await page.evaluate(() => document.body.style.position)).not.toBe(
        'fixed',
      )

      const option = sheet.getByRole('option', { name: 'Sport', exact: true })
      await option.scrollIntoViewIfNeeded()
      await option.tap()
      await expect(sheet).not.toBeVisible()
      await expect(
        page.getByRole('combobox').filter({ hasText: 'Sport' }),
      ).toBeVisible()
      expect(await drawer.boundingBox()).toEqual(before)

      // Reopening shows the choice and a second pick works right away.
      await page.getByRole('combobox').filter({ hasText: 'Sport' }).tap()
      await expect(
        sheet
          .getByRole('option', { name: 'Sport', exact: true })
          .locator('svg')
          .last(),
      ).toBeVisible()
      await sheet
        .getByRole('option', { name: 'Lebensmittel', exact: true })
        .tap()
      await expect(
        page.getByRole('combobox').filter({ hasText: 'Lebensmittel' }),
      ).toBeVisible()
    })
  })
}
