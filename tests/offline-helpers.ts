import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import superjson from 'superjson'

export async function api(
  request: APIRequestContext,
  path: string,
  input: unknown,
  write = false,
) {
  const response = write
    ? await request.post(`http://127.0.0.1:3133/api/trpc/${path}`, {
        data: superjson.serialize(input),
      })
    : await request.get(
        `http://127.0.0.1:3133/api/trpc/${path}?input=${encodeURIComponent(
          superjson.stringify(input),
        )}`,
      )
  const json = await response.json()
  expect(response.ok(), JSON.stringify(json)).toBeTruthy()
  return superjson.deserialize<any>(json.result.data)
}

export async function fixture(request: APIRequestContext) {
  const { groupId } = await api(
    request,
    'groups.create',
    {
      groupFormValues: {
        name: 'Offline Test',
        currency: '€',
        currencyCode: 'EUR',
        participants: [{ name: 'Alice' }, { name: 'Bob' }],
      },
    },
    true,
  )
  const { group } = await api(request, 'groups.get', { groupId })
  const values = {
    title: 'Original Dinner',
    amount: 2400,
    expenseDate: new Date('2026-09-17T00:00:00Z'),
    category: 0,
    paidBy: group.participants[0].id,
    paidFor: group.participants.map((p: any) => ({
      participant: p.id,
      shares: 1,
    })),
    splitMode: 'EVENLY',
    isReimbursement: false,
    saveDefaultSplittingOptions: false,
    documents: [],
    recurrenceRule: 'NONE',
    notes: '',
  }
  const { expenseId } = await api(
    request,
    'groups.expenses.create',
    { groupId, expenseFormValues: values },
    true,
  )
  const { expense } = await api(request, 'groups.expenses.get', {
    groupId,
    expenseId,
  })
  const mutation = {
    id: randomUUID(),
    kind: 'update',
    groupId,
    expenseId,
    baseVersion: expense.syncVersion,
    groupCurrency: JSON.stringify(['€', 'EUR']),
    values: { ...values, title: 'Offline Dinner' },
    localTime: Date.now(),
  }
  return { groupId, group, expenseId, values, expense, mutation }
}

export async function openGroup(
  page: Page,
  f: Awaited<ReturnType<typeof fixture>>,
  // Lie-fi: the OS keeps reporting a connection while requests fail. This is
  // what iOS PWAs commonly see, so navigator.onLine must not be relied upon.
  { lieFi = false } = {},
) {
  await page.addInitScript((lieFi) => {
    // Keep the unrelated third-visit push opt-in dialog from covering controls.
    localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () =>
        lieFi || localStorage.getItem('__spliit-test-offline') !== 'true',
    })
  }, lieFi)
  await page.addInitScript(
    ({ groupId, participantId }) =>
      localStorage.setItem(`${groupId}-activeUser`, participantId),
    { groupId: f.groupId, participantId: f.group.participants[0].id },
  )
  await page.goto(`/groups/${f.groupId}/expenses`)
  await expect(page.getByText('Original Dinner', { exact: true })).toBeVisible()
  // Only the application's automatic preparation may populate the cache.
  // The tests must not repair missing assets by sending WARM_URLS themselves.
  await page.goto(`/groups/${f.groupId}/edit?offline-details`)
  await expect(
    page.locator('[data-testid="group-offline-ready"]:visible'),
  ).toHaveText('Auf diesem Gerät offline bereit', { timeout: 60000 })
  await page.goto(`/groups/${f.groupId}/expenses`)
  await expect(page.getByText('Original Dinner', { exact: true })).toBeVisible()
}

export async function editTitle(page: Page, from: string, to: string) {
  await page.getByText(from, { exact: true }).click()
  try {
    await expect(page.locator('input[name="title"]')).toBeVisible()
  } catch (error) {
    // Retain query-state evidence if a browser loses its local-storage handle.
    console.log(
      'OFFLINE_QUERY_DIAGNOSTICS',
      await page.evaluate(() => {
        const element = document.querySelector('main') as any
        const key = Object.keys(element).find((key) =>
          key.startsWith('__reactFiber'),
        )
        let root = key && element[key]
        while (root?.return) root = root.return
        const queue = [root]
        while (queue.length) {
          const fiber = queue.pop()
          if (!fiber) continue
          const client = fiber.memoizedProps?.client
          if (client?.getQueryCache)
            return client
              .getQueryCache()
              .getAll()
              .map((q: any) => ({
                key: q.queryKey,
                status: q.state.status,
                fetchStatus: q.state.fetchStatus,
                error: q.state.error?.message,
              }))
          queue.push(fiber.child, fiber.sibling)
        }
        return 'Query client unavailable'
      }),
    )
    throw error
  }
  await page.locator('input[name="title"]').fill(to)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()
}
