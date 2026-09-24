import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import superjson from 'superjson'
import { api, editTitle, fixture, openGroup } from './offline-helpers'
import { test } from './offline-network'

test('closed IndexedDB connection is reopened before reading or writing', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  for (const mode of ['readonly', 'readwrite']) {
    await page.evaluate((mode) => {
      const original = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === 'spliit-offline-v1' && args[1] === mode) {
          IDBDatabase.prototype.transaction = original
          this.close() // Real close: subsequent transactions on this handle fail.
        }
        return original.apply(this, args)
      }
    }, mode)
    await editTitle(
      page,
      mode === 'readonly' ? 'Original Dinner' : 'Reopened read',
      mode === 'readonly' ? 'Reopened read' : 'Reopened write',
    )
  }
  await page.reload()
  await expect(page.getByText('Reopened write', { exact: true })).toBeVisible()
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toContainText('2 Änderungen')
  await network.setOffline(context, false)
  await expect
    .poll(
      async () =>
        (await api(request, 'offline.snapshot', { groupId: f.groupId }))
          .expenses[0].title,
    )
    .toBe('Reopened write')
  const snapshot = await api(request, 'offline.snapshot', {
    groupId: f.groupId,
  })
  expect(snapshot.expenses).toHaveLength(1)
  expect(
    snapshot.activities.filter((a: any) => a.activityType === 'UPDATE_EXPENSE'),
  ).toHaveLength(2)
})

test('PWA launch from root survives a disconnected cold start', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page.goto('/')
  await expect(
    page.getByText('Offline Test', { exact: true }).first(),
  ).toBeVisible()
  // Click the card body, not its anchor: this used to request uncached RSC.
  await page
    .getByTestId('recent-group-card')
    .click({ position: { x: 12, y: 55 } })
  await expect(page.getByText('Original Dinner', { exact: true })).toBeVisible()
  await editTitle(page, 'Original Dinner', 'Flight mode edit')
  await page.goto(`/groups/${f.groupId}/edit?offline-details`)
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit')
  await expect(
    page.locator('[data-testid="group-offline-settings"]:visible'),
  ).toContainText('1 Ausgabe gespeichert')
  await expect(
    page.locator('[data-testid="group-offline-settings"]:visible'),
  ).toContainText('1 lokale Änderung wartet auf Übertragung')
  await page.screenshot({
    path: test.info().outputPath('offline-settings.png'),
    fullPage: true,
  })
})

test('settings detect missing cached assets and repair them without test-side warming', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await page.goto(`/groups/${f.groupId}/edit?offline-details`)
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit')
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (!name.startsWith('spliit-offline')) continue
      const cache = await caches.open(name)
      for (const key of await cache.keys())
        if (key.url.endsWith('.js')) await cache.delete(key)
    }
  })
  await network.setOffline(context, true)
  await page.getByRole('button', { name: 'Offline-Stand prüfen' }).click()
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Noch nicht vollständig offline verfügbar')
  await expect(
    page.locator('[data-testid="group-offline-settings"]:visible'),
  ).toContainText('Seiten/Dateien fehlen')
  await network.setOffline(context, false)
  await page
    .getByRole('button', { name: 'Offline-Kopie aktualisieren' })
    .click()
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit', { timeout: 60000 })
  await network.setOffline(context, true)
  await page.reload()
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit')
})

test('legacy installed worker is reported and explicit update enables offline launch', async ({
  page,
  request,
  context,
  network,
}) => {
  const f = await fixture(request)
  network.legacyWorker(true)
  page.on('console', (message) => {
    if (message.text().startsWith('INDEXEDDB_OPEN_ERROR'))
      console.log(message.text())
  })
  await page.addInitScript(() => {
    const open = indexedDB.open.bind(indexedDB)
    indexedDB.open = (name, version) => {
      const request = open(name, version)
      request.addEventListener('error', () =>
        console.log(
          'INDEXEDDB_OPEN_ERROR',
          request.error?.name,
          request.error?.message,
        ),
      )
      return request
    }
  })
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('__spliit-test-offline') !== 'true',
    }),
  )
  await page.goto(`/groups/${f.groupId}/edit?offline-details`)
  await expect(
    page.locator('[data-testid="group-offline-settings"]:visible'),
  ).toContainText('Offline-Dienst antwortet nicht', { timeout: 20000 })
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).not.toHaveText('Auf diesem Gerät offline bereit')
  network.legacyWorker(false)
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
  await page.getByRole('button', { name: 'App-Update installieren' }).click()
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit', { timeout: 60000 })
  await network.setOffline(context, true)
  await page.goto('/groups')
  await expect(
    page.getByText('Offline Test', { exact: true }).first(),
  ).toBeVisible()
})

test('server: conflict, exact-version override, replay, concurrent writes and group isolation', async ({
  request,
}) => {
  const f = await fixture(request)
  await api(
    request,
    'groups.expenses.update',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      expenseFormValues: { ...f.values, title: 'Online Dinner' },
    },
    true,
  )
  const conflict = await api(request, 'offline.commit', f.mutation, true)
  expect(conflict.status).toBe('conflict')
  expect(conflict.current.title).toBe('Online Dinner')
  const override = { ...f.mutation, baseVersion: conflict.current.syncVersion }
  expect((await api(request, 'offline.commit', override, true)).status).toBe(
    'applied',
  )
  expect((await api(request, 'offline.commit', override, true)).status).toBe(
    'applied',
  )
  const snapshot = await api(request, 'offline.snapshot', {
    groupId: f.groupId,
  })
  expect(snapshot.expenses).toHaveLength(1)
  expect(
    snapshot.activities.filter((a: any) => a.activityType === 'UPDATE_EXPENSE'),
  ).toHaveLength(2)
  const current = snapshot.expenses[0]
  const attempts = await Promise.all(
    ['A', 'B'].map((suffix) =>
      api(
        request,
        'offline.commit',
        {
          ...f.mutation,
          id: randomUUID(),
          baseVersion: current.syncVersion,
          values: { ...f.values, title: `Parallel ${suffix}` },
        },
        true,
      ),
    ),
  )
  expect(attempts.map((r) => r.status).sort()).toEqual(['applied', 'conflict'])
  const other = await fixture(request)
  const foreign = await request.get(
    `/api/trpc/groups.expenses.get?input=${encodeURIComponent(
      superjson.stringify({ groupId: other.groupId, expenseId: f.expenseId }),
    )}`,
  )
  expect(foreign.status()).toBe(404)
})

test('server: create retry, update/delete chain and deleted-online restoration', async ({
  request,
}) => {
  const f = await fixture(request)
  const create = {
    ...f.mutation,
    id: randomUUID(),
    expenseId: randomUUID(),
    kind: 'create',
    baseVersion: null,
  }
  const responses = await Promise.all([
    api(request, 'offline.commit', create, true),
    api(request, 'offline.commit', create, true),
  ])
  expect(responses.every((r) => r.status === 'applied')).toBe(true)
  const del = {
    ...create,
    id: randomUUID(),
    kind: 'delete',
    baseVersion: create.id,
    values: undefined,
  }
  expect((await api(request, 'offline.commit', del, true)).status).toBe(
    'applied',
  )
  expect((await api(request, 'offline.commit', create, true)).status).toBe(
    'applied',
  )
  expect(
    (await api(request, 'offline.snapshot', { groupId: f.groupId })).expenses,
  ).toHaveLength(1)
  await api(
    request,
    'groups.expenses.delete',
    { groupId: f.groupId, expenseId: f.expenseId },
    true,
  )
  expect(await api(request, 'offline.commit', f.mutation, true)).toEqual({
    status: 'conflict',
    current: null,
  })
  expect(
    (
      await api(
        request,
        'offline.commit',
        { ...f.mutation, baseVersion: null },
        true,
      )
    ).status,
  ).toBe('applied')
  expect(
    (await api(request, 'offline.snapshot', { groupId: f.groupId })).expenses[0]
      .title,
  ).toBe('Offline Dinner')
})

test('offline reload, local editing, balance navigation, reconnect conflict and accept local', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page.reload()
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toContainText('Offline')
  await editTitle(page, 'Original Dinner', 'My offline change')
  await expect(
    page.getByText('My offline change', { exact: true }),
  ).toBeVisible()
  // The unsynchronized entry itself is marked.
  await expect(page.locator('[data-pending]')).toContainText(
    'Noch nicht synchronisiert',
  )
  await page.reload()
  await expect(
    page.getByText('My offline change', { exact: true }),
  ).toBeVisible()
  await page.goto(`/groups/${f.groupId}/balances`)
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toContainText('1 Änderung')
  await page.goto(`/groups/${f.groupId}/expenses`)
  await api(
    request,
    'groups.expenses.update',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      expenseFormValues: { ...f.values, title: 'Newer online change' },
    },
    true,
  )
  await network.setOffline(context, false)
  await expect(
    page.getByRole('heading', {
      name: 'Diese Ausgabe wurde auch online geändert',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByText(/Newer online change/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Meine Änderung übernehmen' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Diese Ausgabe wurde auch online geändert',
    }),
  ).not.toBeVisible()
  await expect
    .poll(
      async () =>
        (
          await api(request, 'groups.expenses.get', {
            groupId: f.groupId,
            expenseId: f.expenseId,
          })
        ).expense.title,
    )
    .toBe('My offline change')
  // Online and synchronized: nothing of the offline mode is visible.
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toHaveCount(0)
  await expect(page.locator('[data-pending]')).toHaveCount(0)
  const keys = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  )
  expect(keys.some((key) => key.includes('/_next/static/'))).toBe(true)
  expect(keys.some((key) => key.includes('/api/'))).toBe(false)
})

test('conflict: keep online discards only that expense, defer survives reload', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await editTitle(page, 'Original Dinner', 'Local discarded')
  await api(
    request,
    'groups.expenses.update',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      expenseFormValues: { ...f.values, title: 'Keep online' },
    },
    true,
  )
  await network.setOffline(context, false)
  await page.getByRole('button', { name: 'Später entscheiden' }).click()
  await expect(
    page.locator('[data-testid="offline-status"]:visible'),
  ).toContainText('Entscheidung')
  // The header badge reopens the deferred decision.
  await page.locator('[data-testid="offline-status"]:visible').click()
  await page.getByRole('button', { name: 'Jetzt prüfen' }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Diese Ausgabe wurde auch online geändert',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Später entscheiden' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Online-Stand behalten' }).click()
  await expect(page.getByText('Keep online', { exact: true })).toBeVisible()
  expect(
    (
      await api(request, 'groups.expenses.get', {
        groupId: f.groupId,
        expenseId: f.expenseId,
      })
    ).expense.title,
  ).toBe('Keep online')
})

test('offline creation and editing replay once after closing the page', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page
    .getByRole('button', { name: 'Ausgabe hinzufügen', exact: true })
    .click()
  await page.locator('input[name="title"]').fill('Offline Coffee')
  await page.locator('input[name="amount"]').fill('7.50')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText('Offline Coffee', { exact: true })).toBeVisible()
  await editTitle(page, 'Offline Coffee', 'Coffee renamed')
  const replacement = await context.newPage()
  await page.close()
  await replacement.goto(`/groups/${f.groupId}/expenses`)
  await expect(
    replacement.getByText('Coffee renamed', { exact: true }),
  ).toBeVisible()
  await network.setOffline(context, false)
  await expect
    .poll(async () =>
      (
        await api(request, 'offline.snapshot', { groupId: f.groupId })
      ).expenses.map((e: any) => e.title),
    )
    .toContain('Coffee renamed')
  const snapshot = await api(request, 'offline.snapshot', {
    groupId: f.groupId,
  })
  expect(snapshot.expenses).toHaveLength(2)
  expect(
    snapshot.expenses.find((e: any) => e.title === 'Coffee renamed').amount,
  ).toBe(750)
})

test('lost acknowledgement retries the same creation without duplication', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page
    .getByRole('button', { name: 'Ausgabe hinzufügen', exact: true })
    .click()
  await page.locator('input[name="title"]').fill('Lost acknowledgement')
  await page.locator('input[name="amount"]').fill('5')
  await page.locator('button[type="submit"]').click()
  await expect(
    page.getByText('Lost acknowledgement', { exact: true }),
  ).toBeVisible()
  network.dropNextCommit()
  await network.setOffline(context, false)
  await expect
    .poll(
      async () =>
        (await api(request, 'offline.snapshot', { groupId: f.groupId }))
          .expenses.length,
    )
    .toBe(2)
  expect(network.wasDropped()).toBe(true)
  await page.reload()
  // The retry may already run before the reload (connectivity probe) or after
  // it; either way the durable queue must drain without a duplicate.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('spliit-offline-v1', 1)
            open.onerror = () => reject(open.error)
            open.onsuccess = () => {
              const read = open.result
                .transaction('state')
                .objectStore('state')
                .get('data')
              read.onsuccess = () => {
                open.result.close()
                const data = JSON.parse(read.result as string) as {
                  json: { queue: unknown[] }
                }
                resolve(data.json.queue.length)
              }
            }
          }),
      ),
    )
    .toBe(0)
  expect(
    (await api(request, 'offline.snapshot', { groupId: f.groupId })).expenses,
  ).toHaveLength(2)
})

test('another online edit after conflict display requires a new decision', async ({
  request,
}) => {
  const f = await fixture(request)
  const update = async (title: string) =>
    api(
      request,
      'groups.expenses.update',
      {
        groupId: f.groupId,
        expenseId: f.expenseId,
        expenseFormValues: { ...f.values, title },
      },
      true,
    )
  await update('Online v2')
  const shown = await api(request, 'offline.commit', f.mutation, true)
  await update('Online v3')
  const retried = await api(
    request,
    'offline.commit',
    { ...f.mutation, baseVersion: shown.current.syncVersion },
    true,
  )
  expect(retried.status).toBe('conflict')
  expect(retried.current.title).toBe('Online v3')
})

test('offline delete conflicts with online edit before explicit deletion', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page.getByText('Original Dinner', { exact: true }).click()
  await page.getByRole('button', { name: 'Löschen', exact: true }).click()
  await page.getByRole('button', { name: 'Ja', exact: true }).click()
  await expect(
    page.getByText('Original Dinner', { exact: true }),
  ).not.toBeVisible()
  await api(
    request,
    'groups.expenses.update',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      expenseFormValues: { ...f.values, title: 'Updated before deletion' },
    },
    true,
  )
  await network.setOffline(context, false)
  await page.getByRole('button', { name: 'Trotzdem löschen' }).click()
  await expect
    .poll(
      async () =>
        (await api(request, 'offline.snapshot', { groupId: f.groupId }))
          .expenses.length,
    )
    .toBe(0)
})

test('date regression: select tomorrow in Berlin, reopen and reload retain the chosen calendar day', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  // Reproduce the old payload: Sep 18, 00:00 Berlin became Sep 17 in DATE.
  await api(
    request,
    'groups.expenses.update',
    {
      groupId: f.groupId,
      expenseId: f.expenseId,
      expenseFormValues: {
        ...f.values,
        expenseDate: new Date('2026-09-18T00:00:00+02:00'),
      },
    },
    true,
  )
  expect(
    (
      await api(request, 'groups.expenses.get', {
        groupId: f.groupId,
        expenseId: f.expenseId,
      })
    ).expense.expenseDate
      .toISOString()
      .slice(0, 10),
  ).toBe('2026-09-17')
  await openGroup(page, f)
  await page.getByText('Original Dinner', { exact: true }).click()
  await page.locator('button').filter({ hasText: '17. September 2026' }).click()
  await page
    .locator('button[data-day="2026-09-18"], td[data-day="2026-09-18"] button')
    .click()
  await page.keyboard.press('Escape')
  await page.locator('button[type="submit"]').click()
  await expect
    .poll(async () =>
      (
        await api(request, 'groups.expenses.get', {
          groupId: f.groupId,
          expenseId: f.expenseId,
        })
      ).expense.expenseDate
        .toISOString()
        .slice(0, 10),
    )
    .toBe('2026-09-18')
  await page.getByText('Original Dinner', { exact: true }).click()
  await expect(
    page.locator('button').filter({ hasText: '18. September 2026' }),
  ).toBeVisible()
  await page.reload()
  await page.getByText('Original Dinner', { exact: true }).click()
  await expect(
    page.locator('button').filter({ hasText: '18. September 2026' }),
  ).toBeVisible()
})

test('quota failure keeps form and reports that the save did not succeed', async ({
  page,
  context,
  network,
  request,
}) => {
  const f = await fixture(request)
  await openGroup(page, f)
  await network.setOffline(context, true)
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      if (typeof value === 'string' && value.includes('quota-test-title'))
        throw new DOMException('Test quota exhausted', 'QuotaExceededError')
      return put.call(this, value, key)
    }
  })
  await page.getByText('Original Dinner', { exact: true }).click()
  await page.locator('input[name="title"]').fill('quota-test-title')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByRole('alert')).toContainText(
    'Lokales Speichern fehlgeschlagen',
  )
  await expect(page.locator('input[name="title"]')).toHaveValue(
    'quota-test-title',
  )
  expect(
    (
      await api(request, 'groups.expenses.get', {
        groupId: f.groupId,
        expenseId: f.expenseId,
      })
    ).expense.title,
  ).toBe('Original Dinner')
})
