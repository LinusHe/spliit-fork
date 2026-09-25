import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    // The local test instance (see OFFLINE.md), never production on :3033:
    // these tests create groups and trigger push notifications.
    baseURL: 'http://127.0.0.1:3133',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
