import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl =
  "postgres://event_chat:event_chat@127.0.0.1:5433/event_chat_test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./output/playwright",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @event-chat/contracts build && pnpm --filter @event-chat/api db:migrate && pnpm --filter @event-chat/api start",
      url: "http://127.0.0.1:3100/api/v1/health",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3100",
        WEB_ORIGIN: "http://127.0.0.1:5174",
        DATABASE_URL: testDatabaseUrl,
        DATABASE_MAX_CONNECTIONS: "10",
        JWT_ACCESS_SECRET: "phase-4-browser-secret-isolated-from-production",
        JWT_ACCESS_TTL_SECONDS: "900",
        REFRESH_SESSION_TTL_DAYS: "30",
      },
    },
    {
      command:
        "pnpm --filter @event-chat/web exec vite --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: "http://127.0.0.1:3100/api/v1",
        VITE_WS_URL: "ws://127.0.0.1:3100/ws",
      },
    },
  ],
});
