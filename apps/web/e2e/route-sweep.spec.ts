import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

// Day 18 route inventory (docs/11 screen checklist, automated part): every main route at 360, 768
// and 1280 px, in English and Telugu: an h1, no horizontal page scroll, no untranslated key paths,
// and (at 1280 px in English) no serious or critical axe violations. Keyboard, screen reader and
// dark mode passes stay manual. Run alone: it logs in four accounts (OTP limit 10 per IP per hour).
// Each route loads once per language and is checked at each width by resizing.

const WIDTHS = [360, 768, 1280] as const;
const KEY_PATH = /^[a-z][A-Za-z]+(\.[A-Za-z0-9_]+)+$/;

const GROUPS: Array<{ name: string; email: string | null; routes: string[] }> = [
  { name: "public", email: null, routes: ["/", "/timetable", "/feedback", "/feedback/status", "/login"] },
  { name: "citizen", email: "citizen@aptransit.test", routes: ["/tickets", "/passes", "/passes/buy", "/passes/school", "/account", "/updates", "/free-travel"] },
  { name: "ops", email: "manager.knl@aptransit.test", routes: ["/ops", "/ops/buses", "/ops/trips", "/ops/incidents", "/ops/staff", "/ops/complaints"] },
  // D-034: the AP state page uses the fixed id from the states backfill migration
  { name: "gov", email: "transport@aptransit.test", routes: ["/gov", "/gov/state/stateap000000000000000000", "/gov/analytics", "/gov/reports"] },
  {
    name: "admin",
    email: "admin@aptransit.test",
    routes: ["/admin", "/admin/stops", "/admin/routes", "/admin/timetables", "/admin/users", "/admin/policies", "/admin/policies/pass-types", "/admin/audit"],
  },
];

async function check(page: Page, route: string, width: number, locale: "en" | "te"): Promise<string[]> {
  const problems: string[] = [];
  const where = `${route} ${width}px ${locale}`;
  await page.setViewportSize({ width, height: 900 });
  // One load per route and language, then resize: every full load refreshes the session, and the
  // API allows 30 refreshes per user per hour (docs/12), which a reload per width would exceed.
  if (width === WIDTHS[0]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
  } else {
    await page.waitForTimeout(300);
  }
  // Staff pages render after the permission check (useMe), so wait for the heading
  const hasH1 = await page.locator("h1").first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  if (!hasH1) problems.push(`${where}: no h1`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) problems.push(`${where}: horizontal scroll of ${overflow}px`);
  const keys = (await page.locator("body").innerText())
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => KEY_PATH.test(l));
  if (keys.length) problems.push(`${where}: untranslated ${keys.slice(0, 3).join(", ")}`);
  if (width === 1280 && locale === "en") {
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    for (const v of axe.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
      problems.push(`${where}: axe ${v.id} (${v.impact}) on ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(" | ")}`);
    }
  }
  return problems;
}

for (const group of GROUPS) {
  test(`route sweep: ${group.name}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    if (group.email) await login(page, group.email, group.routes[0]);
    const problems: string[] = [];
    for (const locale of ["en", "te"] as const) {
      await context.addCookies([{ name: "locale", value: locale, url: "http://localhost:3000" }]);
      for (const route of group.routes) for (const width of WIDTHS) problems.push(...(await check(page, route, width, locale)));
    }
    await context.close();
    expect(problems, `${group.name} routes`).toEqual([]);
  });
}
