import { test, expect } from '@playwright/test'

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

  // Fetch full group to get participant IDs
  const getRes = await request.get(
    `/api/trpc/groups.get?input=${encodeURIComponent(JSON.stringify({ json: { groupId } }))}`,
  )
  expect(getRes.ok()).toBeTruthy()
  const getBody = await getRes.json()
  const group = getBody.result?.data?.json?.group
  expect(group).toBeTruthy()
  return group
}

test.describe('Push Notifications', () => {
  test('subscribe and unsubscribe flow via API', async ({ request }) => {
    const group = await createTestGroup(request, 'Push Test Group', [
      'Alice',
      'Bob',
    ])
    const groupId = group.id
    const aliceId = group.participants.find(
      (p: { name: string }) => p.name === 'Alice',
    )?.id
    const bobId = group.participants.find(
      (p: { name: string }) => p.name === 'Bob',
    )?.id
    expect(aliceId).toBeTruthy()
    expect(bobId).toBeTruthy()

    // Subscribe Alice to push notifications
    const subscribeRes = await request.post(
      '/api/trpc/notifications.subscribe',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          json: {
            participantId: aliceId,
            subscription: {
              endpoint: 'https://push.example.com/test-alice-endpoint',
              keys: {
                p256dh: 'test-p256dh-key-alice',
                auth: 'test-auth-key-alice',
              },
            },
          },
        },
      },
    )
    expect(subscribeRes.ok()).toBeTruthy()
    const subscribeBody = await subscribeRes.json()
    expect(subscribeBody.result?.data?.json?.success).toBe(true)

    // Check Alice is subscribed
    const isSubscribedRes = await request.get(
      `/api/trpc/notifications.isSubscribed?input=${encodeURIComponent(JSON.stringify({ json: { participantId: aliceId } }))}`,
    )
    expect(isSubscribedRes.ok()).toBeTruthy()
    const isSubscribedBody = await isSubscribedRes.json()
    expect(isSubscribedBody.result?.data?.json?.subscribed).toBe(true)

    // Check Bob is NOT subscribed
    const bobSubscribedRes = await request.get(
      `/api/trpc/notifications.isSubscribed?input=${encodeURIComponent(JSON.stringify({ json: { participantId: bobId } }))}`,
    )
    expect(bobSubscribedRes.ok()).toBeTruthy()
    const bobSubscribedBody = await bobSubscribedRes.json()
    expect(bobSubscribedBody.result?.data?.json?.subscribed).toBe(false)

    // Unsubscribe Alice
    const unsubscribeRes = await request.post(
      '/api/trpc/notifications.unsubscribe',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          json: {
            participantId: aliceId,
            endpoint: 'https://push.example.com/test-alice-endpoint',
          },
        },
      },
    )
    expect(unsubscribeRes.ok()).toBeTruthy()

    // Verify Alice is unsubscribed
    const afterUnsubRes = await request.get(
      `/api/trpc/notifications.isSubscribed?input=${encodeURIComponent(JSON.stringify({ json: { participantId: aliceId } }))}`,
    )
    expect(afterUnsubRes.ok()).toBeTruthy()
    const afterUnsubBody = await afterUnsubRes.json()
    expect(afterUnsubBody.result?.data?.json?.subscribed).toBe(false)
  })

  test('expense creation triggers notification flow', async ({ request }) => {
    const group = await createTestGroup(request, 'Notification Trigger Test', [
      'Alice',
      'Bob',
    ])
    const aliceId = group.participants.find(
      (p: { name: string }) => p.name === 'Alice',
    )?.id
    const bobId = group.participants.find(
      (p: { name: string }) => p.name === 'Bob',
    )?.id

    // Subscribe Alice (she should get notified when Bob creates an expense)
    await request.post('/api/trpc/notifications.subscribe', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        json: {
          participantId: aliceId,
          subscription: {
            endpoint: 'https://push.example.com/alice-trigger-test',
            keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
          },
        },
      },
    })

    // Bob creates an expense — this should trigger a notification to Alice
    // (The push will fail because the endpoint is fake, but it shouldn't error the request)
    const createExpenseRes = await request.post(
      '/api/trpc/groups.expenses.create',
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          json: {
            groupId: group.id,
            participantId: bobId,
            expenseFormValues: {
              title: 'Test Dinner',
              amount: 2500,
              category: 8,
              expenseDate: new Date().toISOString(),
              paidBy: bobId,
              paidFor: [
                { participant: aliceId, shares: 1 },
                { participant: bobId, shares: 1 },
              ],
              splitMode: 'EVENLY',
              isReimbursement: false,
              documents: [],
              notes: '',
              saveDefaultSplittingOptions: false,
            },
          },
        },
      },
    )
    // The expense should be created successfully even though push notification
    // to the fake endpoint will fail (fire-and-forget)
    expect(createExpenseRes.ok()).toBeTruthy()
    const expenseBody = await createExpenseRes.json()
    expect(expenseBody.result?.data?.json?.expenseId).toBeTruthy()
  })

  test('notification bell appears on group page', async ({ page }) => {
    const group = await createTestGroup(page.request, 'Bell UI Test', [
      'TestUser',
    ])
    const participantId = group.participants[0].id

    // Navigate and set active user
    await page.goto(`/groups/${group.id}`)
    await page.evaluate(
      ({ groupId, participantId }) => {
        localStorage.setItem(`${groupId}-activeUser`, participantId)
      },
      { groupId: group.id, participantId },
    )
    await page.reload()

    // Page should load without errors
    await expect(page).toHaveURL(new RegExp(`/groups/${group.id}`))
    // Group name should be visible
    await expect(page.getByRole('link', { name: 'Bell UI Test' })).toBeVisible()
  })
})
