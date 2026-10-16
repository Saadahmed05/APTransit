import { type APIRequestContext, expect, test } from "@playwright/test";
import { login, tomorrowIst, uniqueEmail } from "./helpers";

// D-046, D-048: a free travel pass on a local (seatless) bus books with one tap. No seat map and no
// name, age or gender fields anywhere. The pass is set up through the API with the citizen's token.
const API = process.env.E2E_API_URL ?? "http://localhost:4000/api/v1";

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const requested = await request.post(`${API}/auth/otp/request`, { data: { channel: "EMAIL", target: email } });
  const { devCode } = (await requested.json()) as { devCode?: string };
  expect(devCode, "API must run with OTP_DEV_ECHO=1").toMatch(/^\d{6}$/);
  const verified = await request.post(`${API}/auth/otp/verify`, { data: { channel: "EMAIL", target: email, code: devCode } });
  return ((await verified.json()) as { accessToken: string }).accessToken;
}

test.describe("v4 free travel on a local bus", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the seeded development stack");

  test("gets a free local ticket without any seat or passenger form", async ({ page, request }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("v4-free");
    await login(page, email);

    // Eligibility and the pass, as the free travel page would do
    const headers = { authorization: `Bearer ${await apiToken(request, email)}` };
    const check = await request.post(`${API}/eligibility/stree-shakti`, {
      headers,
      data: { consent: true, declaration: { category: "WOMAN", apDomicile: true }, idType: "AADHAAR" },
    });
    expect(check.ok(), await check.text()).toBe(true);
    const types = (await (await request.get(`${API}/pass-types`)).json()) as { id: string; kind: string }[];
    const freeType = types.find((t) => t.kind === "FREE_TRAVEL")!;
    const pass = (await (await request.post(`${API}/passes`, { headers, data: { passTypeId: freeType.id } })).json()) as { id: string };
    expect((await request.post(`${API}/passes/${pass.id}/activate`, { headers })).ok()).toBe(true);

    // A City Ordinary trip on the Kurnool malls line
    const place = async (q: string) =>
      ((await (await page.request.get(`/api/v1/places/search?q=${encodeURIComponent(q)}&limit=1`)).json()) as { id: string }[])[0]!.id;
    const from = await place("Kurnool Bus Stand");
    const to = await place("Jyothi Mall");
    await page.goto(`/search?from=${from}&to=${to}&date=${tomorrowIst(1)}`);
    await page.locator("a[data-testid='trip-card']").first().click();
    await page.waitForURL(/\/bus\//);
    await expect(page.getByText("Space", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Get free ticket", exact: true }).click();
    await page.waitForURL(/\/free/);

    await expect(page.getByRole("heading", { level: 1, name: "Free local ticket" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Seat \d+, available$/ })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Get free ticket", exact: true }).click();
    await page.waitForURL(/\/book\/done\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Ticket booked" })).toBeVisible({ timeout: 15_000 });
  });
});
