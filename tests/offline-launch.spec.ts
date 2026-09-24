import { expect } from '@playwright/test'
import { fixture, openGroup } from './offline-helpers'
import { test } from './offline-network'

test('PWA start page works without a connection while the OS claims to be online', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f, { lieFi: true })
  await network.setOffline(context, true)
  await page.goto('/groups')
  const card = page.getByTestId('recent-group-card').first()
  await expect(card).toContainText('Offline Test')
  // The balance comes from the local copy instead of an endless spinner.
  await expect(card).toContainText('12')
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toContainText('Offline')
  await card.click({ position: { x: 12, y: 55 } })
  await expect(page.getByText('Original Dinner', { exact: true })).toBeVisible()
})

test('app update activated at the next cold start keeps the offline launch working', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  network.bumpWorker()
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update()
  })
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    .toBe(true)
  // Closing the app lets the browser activate the waiting worker on launch.
  await page.close()
  await network.setOffline(context, true)
  // The relaunched app has no navigator.onLine override: the OS claims online.
  const fresh = await context.newPage()
  await fresh.goto('/groups')
  await expect
    .poll(() =>
      fresh.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration()
        return Boolean(reg?.active && !reg.waiting)
      }),
    )
    .toBe(true)
  await fresh.reload()
  const card = fresh.getByTestId('recent-group-card').first()
  await expect(card).toContainText('Offline Test')
  await card.click({ position: { x: 12, y: 55 } })
  await expect(
    fresh.getByText('Original Dinner', { exact: true }),
  ).toBeVisible()
})

test('a group that was never stored is marked instead of opening a dead end', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  const other = await fixture(request)
  await page.addInitScript(
    ({ id }) => {
      const recent = JSON.parse(
        localStorage.getItem('recentGroups') ?? '[]',
      ) as { id: string }[]
      if (!recent.some((g) => g.id === id))
        localStorage.setItem(
          'recentGroups',
          JSON.stringify([...recent, { id, name: 'Nie geöffnet' }]),
        )
    },
    { id: other.groupId },
  )
  await openGroup(page, f)
  // /groups was never opened online, so only the visited group is stored.
  await network.setOffline(context, true)
  await page.goto('/groups')
  const card = page
    .getByTestId('recent-group-card')
    .filter({ hasText: 'Nie geöffnet' })
  await expect(card).toContainText('Offline nicht verfügbar')
  await card.click({ position: { x: 12, y: 55 } })
  await expect(
    page.getByText('Diese Gruppe wurde auf diesem Gerät').first(),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/groups$/)
})
