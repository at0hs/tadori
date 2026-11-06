import { defineConfig, devices } from "@playwright/test";

// F-01 の AC を、本物の API とテスト用 DB で確かめる（ui.md 7章）。
// API は起動のたびにテスト用 DB を空にするので、`pnpm test` と同時に流さない。
const API_PORT = 3100;
const WEB_PORT = 5174;
const APP_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: APP_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: [
    {
      command: "node ../server/test/e2e-server.ts",
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        APP_URL,
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          "postgres://tadori:tadori-test@localhost:5434/tadori_test",
        BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
        LOG_LEVEL: "warn",
        INITIAL_ADMIN_USERNAME: "admin",
        INITIAL_ADMIN_NAME: "管理 花子",
        INITIAL_ADMIN_EMAIL: "admin@example.test",
        INITIAL_ADMIN_PASSWORD: "E2e-initial-passw0rd",
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { PORT: String(API_PORT) },
    },
  ],
});
