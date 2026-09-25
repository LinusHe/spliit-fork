import { expect, type Page } from '@playwright/test'
import { getExpenseShares } from '../src/lib/shares'
import { api, fixture } from './offline-helpers'
import { test } from './offline-network'

async function asAlice(page: Page, f: Awaited<ReturnType<typeof fixture>>) {
  await page.addInitScript(
    ({ groupId, participantId }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId: f.groupId, participantId: f.group.participants[0].id },
  )
}

// upstream #562/#647: the leftover cent of an even split is apportioned once,
// the same way everywhere, and the form previews exactly what gets saved.
test('even split preview equals the saved split to the cent', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  const [alice, bob] = f.group.participants
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses/create`)
  await page.locator('input[name="title"]').fill('Odd cents')
  await page.locator('input[name="amount"]').fill('16.57')
  const preview = async (name: string) => {
    const text = await page
      .locator('label')
      .filter({ hasText: new RegExp(`^${name}`) })
      .innerText()
    return Math.round(
      Number(/([\d.,]+)\s*€/.exec(text)![1].replace(',', '.')) * 100,
    )
  }
  await expect.poll(() => preview('Alice')).toBeGreaterThan(0)
  const shown = {
    [alice.id]: await preview('Alice'),
    [bob.id]: await preview('Bob'),
  }
  expect(shown[alice.id] + shown[bob.id]).toBe(1657)
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="title"]')).not.toBeVisible()

  // The saved expense splits exactly as previewed (same id, same apportionment
  // the balances, stats and CSV use).
  let saved: any
  await expect
    .poll(async () => {
      const { expenses } = await api(request, 'offline.snapshot', {
        groupId: f.groupId,
      })
      saved = expenses.find((e: any) => e.title === 'Odd cents')
      return !!saved
    })
    .toBe(true)
  const shares = getExpenseShares({
    id: saved.id,
    amount: saved.amount,
    splitMode: saved.splitMode,
    paidFor: saved.paidFor.map((p: any) => ({
      participantId: p.participantId,
      shares: p.shares,
    })),
  })
  expect(shares.get(alice.id)).toBe(shown[alice.id])
  expect(shares.get(bob.id)).toBe(shown[bob.id])
})

// upstream #560: spreadsheet formulas in user text are neutralised in the CSV.
test('CSV export neutralises formulas in titles', async ({ request }) => {
  const f = await fixture(request)
  await api(
    request,
    'groups.expenses.create',
    {
      groupId: f.groupId,
      expenseFormValues: { ...f.values, title: '=HYPERLINK("http://x")' },
    },
    true,
  )
  const csv = await (
    await request.get(`/groups/${f.groupId}/expenses/export/csv`)
  ).text()
  expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
  expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m)
})

// Receipt uploads: images only, and the server path is not handed out (the AI
// actions only accept the returned name, see lib/receipt-upload.ts).
test('receipt upload accepts images only and returns just a name', async ({
  request,
}) => {
  const text = await request.post('/api/receipt-upload', {
    multipart: {
      file: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
    },
  })
  expect(text.status()).toBe(400)
  const image = await request.post('/api/receipt-upload', {
    multipart: {
      file: {
        name: 'r.png',
        mimeType: 'image/png',
        buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
      },
    },
  })
  expect(image.status()).toBe(200)
  const body = await image.json()
  expect(body.filename).toMatch(/^[0-9a-f-]{36}\.png$/)
  expect(body.path).toBeUndefined()
})

// upstream #639 + even distribution: the difference is shown and can be split
// evenly, e.g. the tip on top of individually entered restaurant items.
test('difference of a by-amount split can be spread evenly (tip)', async ({
  page,
  request,
}) => {
  const { groupId } = await api(
    request,
    'groups.create',
    {
      groupFormValues: {
        name: 'Restaurant',
        currency: '€',
        currencyCode: 'EUR',
        participants: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
      },
    },
    true,
  )
  const { group } = await api(request, 'groups.get', { groupId })
  const [alice, bob, carol] = group.participants
  await page.addInitScript(
    ({ groupId, participantId }) => {
      localStorage.setItem('spliit-notification-prompt-dismissed', 'true')
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId, participantId: alice.id },
  )
  const split = {
    splitMode: 'BY_AMOUNT',
    paidFor: [
      { participant: alice.id, shares: '50' },
      { participant: bob.id, shares: '20' },
      { participant: carol.id, shares: '20' },
    ],
  }
  await page.goto(
    `/groups/${groupId}/expenses/create?title=Pizzeria&amount=100&split=${encodeURIComponent(
      JSON.stringify(split),
    )}`,
  )
  const box = page.getByTestId('split-difference')
  await expect(box).toContainText('Es fehlen noch 10,00')
  await expect(box).toContainText('Aufgeteilt: 90,00')
  await box.getByRole('button', { name: /gleichmäßig aufteilen/ }).click()
  await expect(box).not.toBeVisible()
  await page.locator('button[type="submit"]').click()
  let saved: any
  await expect
    .poll(async () => {
      const { expenses } = await api(request, 'offline.snapshot', { groupId })
      saved = expenses.find((e: any) => e.title === 'Pizzeria')
      return !!saved
    })
    .toBe(true)
  const shares = Object.fromEntries(
    saved.paidFor.map((p: any) => [p.participantId, p.shares]),
  )
  expect(shares[alice.id] + shares[bob.id] + shares[carol.id]).toBe(10000)
  expect(shares[alice.id] - 5000).toBeGreaterThanOrEqual(333)
  expect(shares[bob.id] - 2000).toBeGreaterThanOrEqual(333)
  expect(shares[carol.id] - 2000).toBeGreaterThanOrEqual(333)
})

test('percentages that do not add up show the gap and can be evened out', async ({
  page,
  request,
}) => {
  const f = await fixture(request)
  const [alice, bob] = f.group.participants
  await asAlice(page, f)
  const split = {
    splitMode: 'BY_PERCENTAGE',
    paidFor: [
      { participant: alice.id, shares: '40' },
      { participant: bob.id, shares: '40' },
    ],
  }
  await page.goto(
    `/groups/${
      f.groupId
    }/expenses/create?title=Taxi&amount=30&split=${encodeURIComponent(
      JSON.stringify(split),
    )}`,
  )
  const box = page.getByTestId('split-difference')
  await expect(box).toContainText('Es fehlen noch 20 %')
  await box.getByRole('button', { name: /gleichmäßig aufteilen/ }).click()
  await expect(box).not.toBeVisible()
})

// upstream #558: share a group as QR code.
test('group can be shared as QR code', async ({ page, request }) => {
  const f = await fixture(request)
  await asAlice(page, f)
  await page.goto(`/groups/${f.groupId}/expenses`)
  await page.getByTitle('Teilen').click()
  await page.getByTitle('Per QR-Code teilen').click()
  const dialog = page.getByRole('dialog', { name: 'Per QR-Code teilen' })
  await expect(dialog.locator('svg[role="img"], svg').first()).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'QR-Code herunterladen' }),
  ).toBeVisible()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'QR-Code herunterladen' }).click()
  expect((await download).suggestedFilename()).toBe('Offline Test-qr-code.png')
})
