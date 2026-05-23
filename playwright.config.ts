import { defineConfig } from "@playwright/test";

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DATABASE_URL: "file:./e2e.db",
      DATABASE_AUTH_TOKEN: "",
      ADMIN_SECRET_KEY: "e2e-admin-secret",
      CRON_SECRET: "e2e-cron-secret",
      R2_ACCOUNT_ID: "local",
      R2_ACCESS_KEY_ID: "local",
      R2_SECRET_ACCESS_KEY: "local",
      R2_BUCKET_NAME: "local",
      R2_PUBLIC_URL: "https://example.com",
      NEXT_PUBLIC_BASE_URL: baseURL,
    },
  },
});
