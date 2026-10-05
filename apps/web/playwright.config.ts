import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for apps/web.
 * Run with: pnpm e2e (from the repo root) or pnpm --filter web e2e
 * Starts the API and web apps when they are not already running.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // CI keeps the html report too: the e2e job uploads it when a run fails
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.CI ? [
    {
      command: "pnpm --filter api start",
      url: "http://localhost:4000/api/v1/health",
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: "../..",
    },
    {
      command: "pnpm --filter web start",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: "../..",
    },
  ] : undefined,
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Pixel 7",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
