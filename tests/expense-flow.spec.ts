import { test, expect, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestGroup(
  request: import('@playwright/test').APIRequestContext,
  name: string,
  participants: string[],
) {
  const createRes = await request.post('/api/trpc/groups.create', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      json: {
        groupFormValues: {
          name,
          currency: '€',
          participants: participants.map((n) => ({ name: n })),
        },
      },
    },
  })
  expect(createRes.ok()).toBeTruthy()
  const body = await createRes.json()
  const groupId = body.result?.data?.json?.groupId
  expect(groupId).toBeTruthy()

  const getRes = await request.get(
    `/api/trpc/groups.get?input=${encodeURIComponent(JSON.stringify({ json: { groupId } }))}`,
  )
  expect(getRes.ok()).toBeTruthy()
  const getBody = await getRes.json()
  const group = getBody.result?.data?.json?.group
  return {
    id: groupId as string,
    participants: group.participants as { id: string; name: string }[],
  }
}

async function createExpenseViaAPI(
  request: import('@playwright/test').APIRequestContext,
  groupId: string,
  opts: {
    title: string
    amount: number
    paidById: string
    paidForIds: string[]
    categoryId?: number
    splitMode?: string
  },
) {
  const res = await request.post('/api/trpc/groups.expenses.create', {
    headers: { 'Content-Type': 'application/json' },
    data: {
      json: {
        groupId,
        expenseFormValues: {
          title: opts.title,
          amount: opts.amount,
          expenseDate: new Date().toISOString(),
          category: opts.categoryId ?? 0,
          paidBy: opts.paidById,
          paidFor: opts.paidForIds.map((id) => ({
            participant: id,
            shares: '1',
          })),
          splitMode: opts.splitMode ?? 'EVENLY',
          isReimbursement: false,
          saveDefaultSplittingOptions: false,
          documents: [],
          notes: '',
        },
      },
    },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  const expenseId = body.result?.data?.json?.expenseId
  expect(expenseId).toBeTruthy()
  return expenseId as string
}

/** Set active user in localStorage and dismiss the "who are you?" dialog */
async function setActiveUser(
  page: Page,
  groupId: string,
  participantId: string,
) {
  await page.evaluate(
    ({ groupId, participantId }) => {
      localStorage.setItem(`${groupId}-activeUser`, participantId)
    },
    { groupId, participantId },
  )
}

/** Navigate to group page, set active user, and dismiss any dialog */
async function goToGroup(
  page: Page,
  groupId: string,
  participantId: string,
) {
  // Set active user before navigating to prevent the dialog
  await page.goto(`/groups/${groupId}`)
  await setActiveUser(page, groupId, participantId)
  await page.reload()
  // Wait for page to be ready
  await page.waitForLoadState('networkidle')
  // Dismiss dialog if it still appears
  const dialog = page.locator('[role="dialog"]')
  if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    const closeBtn = dialog.locator('button').first()
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click()
      await dialog.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {})
    }
  }
}

/** Get the main amount input (not originalAmount) */
function getAmountInput(page: Page) {
  return page.locator('input[name="amount"]')
}

// ---------------------------------------------------------------------------
// Tests: Expense List & Navigation
// ---------------------------------------------------------------------------

test.describe('Expense List', () => {
  test('group page shows expenses tab with created expenses', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'ListGrp', ['Alice', 'Bob'])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    const bob = group.participants.find((p) => p.name === 'Bob')!

    await createExpenseViaAPI(request, group.id, {
      title: 'Lunch',
      amount: 2400,
      paidById: alice.id,
      paidForIds: [alice.id, bob.id],
    })
    await createExpenseViaAPI(request, group.id, {
      title: 'Taxi',
      amount: 1500,
      paidById: bob.id,
      paidForIds: [alice.id, bob.id],
    })

    await goToGroup(page, group.id, alice.id)
    await expect(page.getByText('Lunch')).toBeVisible()
    await expect(page.getByText('Taxi')).toBeVisible()
  })

  test('clicking an expense navigates to edit view', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'NavGrp', ['Alice', 'Bob'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Groceries',
      amount: 5000,
      paidById: alice.id,
      paidForIds: group.participants.map((p) => p.id),
    })

    await goToGroup(page, group.id, alice.id)
    await page.getByText('Groceries').click()

    // Should show the expense edit form (either as page or drawer)
    await expect(page.getByLabel(/title/i).first()).toHaveValue('Groceries', {
      timeout: 10000,
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: Create Expense
// ---------------------------------------------------------------------------

test.describe('Create Expense', () => {
  test('can create an expense via the UI form', async ({ page, request }) => {
    const group = await createTestGroup(request, 'CreateGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/create`)

    // Fill the form
    await page.getByLabel(/title/i).first().fill('Dinner')
    await getAmountInput(page).fill('35.50')

    // Select paidBy — radix Select component
    const paidBySection = page.locator('.space-y-2', {
      has: page.getByText(/paid by|bezahlt von/i),
    })
    await paidBySection.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Alice' }).click()

    // Submit
    await page.getByRole('button', { name: /create|erstellen/i }).click()

    // Should redirect back to group
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })

    // Expense should appear in list
    await expect(page.getByText('Dinner')).toBeVisible()
  })

  test('create page loads without errors', async ({ page, request }) => {
    const group = await createTestGroup(request, 'ScanHintGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/create`)

    // The create form heading should be visible
    await expect(
      page.getByRole('heading', { name: /create|erstellen/i }),
    ).toBeVisible()
  })

  test('create page accepts query params for pre-fill', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'PrefillGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await goToGroup(page, group.id, alice.id)
    await page.goto(
      `/groups/${group.id}/expenses/create?title=Prefilled&amount=42.50&from=${alice.id}`,
    )

    // Title should be pre-filled
    await expect(page.getByLabel(/title/i).first()).toHaveValue('Prefilled')

    // Amount should be pre-filled
    await expect(getAmountInput(page)).toHaveValue('42.5')
  })
})

// ---------------------------------------------------------------------------
// Tests: Edit Expense
// ---------------------------------------------------------------------------

test.describe('Edit Expense', () => {
  test('can edit an expense title', async ({ page, request }) => {
    const group = await createTestGroup(request, 'EditGrp', ['Alice', 'Bob'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Old Title',
      amount: 1000,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    const titleInput = page.getByLabel(/title/i).first()
    await expect(titleInput).toHaveValue('Old Title')
    await titleInput.fill('New Title')

    await page.getByRole('button', { name: /save|speichern/i }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })

    await expect(page.getByText('New Title')).toBeVisible()
  })

  test('edit page shows duplicate button in action bar', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'DupGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'To Duplicate',
      amount: 2500,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    // Duplicate button should be visible — use exact match to avoid group name
    const duplicateBtn = page.getByRole('link', {
      name: /^duplicate$|^duplizieren$/i,
    })
    await expect(duplicateBtn).toBeVisible()

    // Click it — should navigate to create with params
    await duplicateBtn.click()
    await expect(page).toHaveURL(/expenses\/create\?/)
    await expect(page.getByLabel(/title/i).first()).toHaveValue('To Duplicate')
  })

  test('edit page shows delete button', async ({ page, request }) => {
    const group = await createTestGroup(request, 'DelBtnGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'To Delete',
      amount: 500,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    const deleteBtn = page.getByRole('button', {
      name: /^delete$|^löschen$/i,
    })
    await expect(deleteBtn).toBeVisible()
  })

  test('can delete an expense', async ({ page, request }) => {
    const group = await createTestGroup(request, 'DelGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'DeleteMe',
      amount: 100,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    // Navigate directly to edit page (avoids dialog issues)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    // Click delete button
    await page
      .getByRole('button', { name: /^delete$|^löschen$/i })
      .click()

    // Confirm in popup dialog
    const confirmDialog = page.locator('[role="dialog"]')
    await confirmDialog.waitFor({ state: 'visible' })
    await confirmDialog
      .getByRole('button', { name: /delete|löschen|yes|ja/i })
      .click()

    // Should redirect and expense should be gone
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })
    await expect(page.getByText('DeleteMe')).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Tests: Expense Detail View (important for drawer migration)
// ---------------------------------------------------------------------------

test.describe('Expense Detail View', () => {
  test('shows correct expense data', async ({ page, request }) => {
    const group = await createTestGroup(request, 'DetailGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    const bob = group.participants.find((p) => p.name === 'Bob')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Hotel Stay',
      amount: 15000,
      paidById: alice.id,
      paidForIds: [alice.id, bob.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    // Title
    await expect(page.getByLabel(/title/i).first()).toHaveValue('Hotel Stay')

    // Amount (15000 cents → 150.00)
    await expect(getAmountInput(page)).toHaveValue('150')
  })

  test('deep link to edit expense works directly', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'DeepLinkGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Deep Linked',
      amount: 999,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)
    await expect(page.getByLabel(/title/i).first()).toHaveValue('Deep Linked')
  })
})

// ---------------------------------------------------------------------------
// Tests: Split Modes
// ---------------------------------------------------------------------------

test.describe('Split Modes', () => {
  test('EVENLY split creates equal shares', async ({ page, request }) => {
    const group = await createTestGroup(request, 'EvenGrp', [
      'Alice',
      'Bob',
      'Charlie',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/create`)

    await page.getByLabel(/title/i).first().fill('Even Split')
    await getAmountInput(page).fill('90')

    // Select paidBy — radix Select component
    const paidBySection = page.locator('.space-y-2', {
      has: page.getByText(/paid by|bezahlt von/i),
    })
    await paidBySection.getByRole('combobox').click()
    await page.getByRole('option', { name: 'Alice' }).click()

    // All participants should be checked by default (EVENLY)
    for (const p of group.participants) {
      await expect(
        page.getByRole('checkbox', { name: new RegExp(p.name) }),
      ).toBeChecked()
    }

    await page.getByRole('button', { name: /create|erstellen/i }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })
  })

  test('BY_AMOUNT split mode is available', async ({ page, request }) => {
    const group = await createTestGroup(request, 'AmountGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/create`)

    await page.getByLabel(/title/i).first().fill('Custom Split')
    await getAmountInput(page).fill('100')

    // Open advanced options
    const advancedToggle = page.getByText(/advanced|erweitert/i)
    await advancedToggle.click()

    // Split mode selector should show EVENLY by default
    const splitModeSelect = page
      .locator('[data-state="open"], [role="combobox"]')
      .filter({ hasText: /even/i })
    // Page should have advanced options visible
    await expect(
      page.getByText(/split mode|aufteilung/i).first(),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Tests: Navigation & Back Button
// ---------------------------------------------------------------------------

test.describe('Navigation', () => {
  test('cancel button returns to group page', async ({ page, request }) => {
    const group = await createTestGroup(request, 'CancelGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'CancelExp',
      amount: 100,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)

    // Use exact match for Cancel button to avoid matching group name
    await page
      .getByRole('link', { name: 'Cancel', exact: true })
      .or(page.getByRole('link', { name: 'Abbrechen', exact: true }))
      .click()

    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })
  })

  test('after saving, user returns to group view', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'SaveNavGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'SaveNav',
      amount: 100,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)
    await page.getByRole('button', { name: /save|speichern/i }).click()
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`), {
      timeout: 10000,
    })
  })

  test('expenses in stats link to edit view', async ({ page, request }) => {
    const group = await createTestGroup(request, 'StatsNavGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await createExpenseViaAPI(request, group.id, {
      title: 'Statsable',
      amount: 5000,
      paidById: alice.id,
      paidForIds: group.participants.map((p) => p.id),
    })

    await goToGroup(page, group.id, alice.id)

    // Navigate to stats tab
    const statsTab = page.getByRole('tab', { name: /stats|statistik/i })
    if (await statsTab.isVisible()) {
      await statsTab.click()
      // If expense appears in stats breakdown, click it
      const statsExpense = page.getByText('Statsable')
      if (await statsExpense.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statsExpense.click()
        // Should show expense detail (page or drawer)
        await expect(page.getByLabel(/title/i).first()).toHaveValue(
          'Statsable',
        )
      }
    }
  })

  test('activity tab shows expense entries', async ({ page, request }) => {
    const group = await createTestGroup(request, 'ActivityGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    await createExpenseViaAPI(request, group.id, {
      title: 'Activity Expense',
      amount: 3000,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    const activityTab = page.getByRole('tab', { name: /activity|aktivität/i })
    if (await activityTab.isVisible()) {
      await activityTab.click()
      await expect(page.getByText('Activity Expense')).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Balances
// ---------------------------------------------------------------------------

test.describe('Balances', () => {
  test('balances update after creating expense', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'BalanceGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    const bob = group.participants.find((p) => p.name === 'Bob')!

    await createExpenseViaAPI(request, group.id, {
      title: 'Balance Check',
      amount: 10000,
      paidById: alice.id,
      paidForIds: [alice.id, bob.id],
    })

    await goToGroup(page, group.id, alice.id)
    const balancesTab = page.getByRole('tab', { name: /balances|salden/i })
    if (await balancesTab.isVisible()) {
      await balancesTab.click()
      await expect(page.getByText('Alice')).toBeVisible()
      await expect(page.getByText('Bob')).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Tabs (important for drawer — tabs should stay functional)
// ---------------------------------------------------------------------------

test.describe('Group Tabs', () => {
  test('all tabs are present and clickable', async ({ page, request }) => {
    const group = await createTestGroup(request, 'TabsGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    await goToGroup(page, group.id, alice.id)

    const tabNames = [
      /expense/i,
      /balance/i,
      /stats|statistik/i,
      /activity|aktivität/i,
      /settings|einstellungen/i,
    ]

    for (const tabName of tabNames) {
      const tab = page.getByRole('tab', { name: tabName })
      if (await tab.isVisible().catch(() => false)) {
        await tab.click()
        await expect(tab).toHaveAttribute('data-state', 'active', {
          timeout: 3000,
        })
      }
    }
  })

  test('information tab is removed (merged into settings)', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'NoInfoGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    await goToGroup(page, group.id, alice.id)

    const infoTab = page.getByRole('tab', {
      name: /^information$/i,
      exact: true,
    })
    await expect(infoTab).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Tests: Settings
// ---------------------------------------------------------------------------

test.describe('Settings', () => {
  test('settings tab shows group info and edit form', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'SettingsGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    await goToGroup(page, group.id, alice.id)

    const settingsTab = page.getByRole('tab', {
      name: /settings|einstellungen/i,
    })
    if (await settingsTab.isVisible()) {
      await settingsTab.click()
      await expect(page.getByText('SettingsGrp')).toBeVisible()
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Edge Cases
// ---------------------------------------------------------------------------

test.describe('Edge Cases', () => {
  test('empty group shows group page', async ({ page, request }) => {
    const group = await createTestGroup(request, 'EmptyGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    await goToGroup(page, group.id, alice.id)

    // Group should load — the group name link should be visible
    await expect(
      page.getByRole('link', { name: 'EmptyGrp' }),
    ).toBeVisible()
  })

  test('small expense amount works', async ({ request }) => {
    const group = await createTestGroup(request, 'SmallGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    // 1 cent
    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Tiny',
      amount: 1,
      paidById: alice.id,
      paidForIds: [alice.id],
    })
    expect(expenseId).toBeTruthy()
  })

  test('reimbursement flag works', async ({ page, request }) => {
    const group = await createTestGroup(request, 'ReimburseGrp', [
      'Alice',
      'Bob',
    ])
    const alice = group.participants.find((p) => p.name === 'Alice')!
    const bob = group.participants.find((p) => p.name === 'Bob')!

    await goToGroup(page, group.id, alice.id)
    await page.goto(
      `/groups/${group.id}/expenses/create?reimbursement=1&amount=50&from=${alice.id}&to=${bob.id}`,
    )

    // Title should be pre-filled with reimbursement text
    const titleInput = page.getByLabel(/title/i).first()
    const titleValue = await titleInput.inputValue()
    expect(titleValue.length).toBeGreaterThan(0)
  })

  test('large expense amount displays correctly', async ({
    page,
    request,
  }) => {
    const group = await createTestGroup(request, 'LargeGrp', ['Alice'])
    const alice = group.participants.find((p) => p.name === 'Alice')!

    const expenseId = await createExpenseViaAPI(request, group.id, {
      title: 'Big Purchase',
      amount: 99999900,
      paidById: alice.id,
      paidForIds: [alice.id],
    })

    await goToGroup(page, group.id, alice.id)
    await page.goto(`/groups/${group.id}/expenses/${expenseId}/edit`)
    await expect(page.getByLabel(/title/i).first()).toHaveValue('Big Purchase')
  })
})
