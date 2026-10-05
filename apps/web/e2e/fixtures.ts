import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

/**
 * Logged in citizens for the journeys (docs/14). Each Playwright worker logs a citizen in once and
 * keeps the browser context, so a full run stays inside the OTP limit of 10 requests per IP per
 * hour (docs/12). `citizen2` is the seeded citizen2@aptransit.test (gift recipient).
 */
type WorkerFixtures = { citizenContext: BrowserContext; citizen2Context: BrowserContext };
type TestFixtures = { citizen: Page; citizen2: Page };

async function loggedInContext(browser: Browser, options: Record<string, unknown>, email: string) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await login(page, email);
  await page.close();
  return context;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  citizenContext: [
    async ({ browser }, provide, workerInfo) => {
      const context = await loggedInContext(browser, workerInfo.project.use as Record<string, unknown>, uniqueEmail("e2e-citizen"));
      await provide(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  citizen2Context: [
    async ({ browser }, provide, workerInfo) => {
      const context = await loggedInContext(browser, workerInfo.project.use as Record<string, unknown>, "citizen2@aptransit.test");
      await provide(context);
      await context.close();
    },
    { scope: "worker" },
  ],
  citizen: async ({ citizenContext }, provide) => {
    const page = await citizenContext.newPage();
    await provide(page);
    await page.close();
  },
  citizen2: async ({ citizen2Context }, provide) => {
    const page = await citizen2Context.newPage();
    await provide(page);
    await page.close();
  },
});

export { expect };

/**
 * Moves a ticket's trip so its boarding stop departs in `minutes` (default 30), which opens the
 * activation window. Dev and CI only: runs `pnpm --filter api demo:window` (APP_ENV=development).
 */
export function openActivationWindow(ticketCode: string, minutes = 30): void {
  // The code comes from the page; only a real ticket code may reach the shell
  if (!/^APT-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(ticketCode) || !Number.isInteger(minutes)) throw new Error(`Bad ticket code ${ticketCode}`);
  execSync(`pnpm --filter api demo:window ${ticketCode} ${minutes}`, { cwd: resolve(__dirname, "../../.."), stdio: "pipe" });
}

/** From the booking confirmation, open the first ticket of the booking. Returns its code. */
export async function openFirstTicket(page: Page): Promise<string> {
  const card = page.getByRole("link", { name: /not active/i }).first();
  await card.click();
  await page.waitForURL(/\/tickets\/[a-z0-9]+$/);
  const code = await page.getByText(/^APT-[0-9A-Z]{4}-[0-9A-Z]{4}$/).first().textContent();
  expect(code).toBeTruthy();
  return code!.trim();
}
