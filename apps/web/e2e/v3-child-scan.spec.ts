import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { buildQrContent, formatCode, qrStep, stepMessage } from "@aptransit/shared";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { login, uniqueEmail } from "./helpers";

// A conductor scans a child card: the scan is valid and the parent gets CHILD_BOARDED (D-042).
// The parent buys and activates the card in the browser; the driver starts the seeded trip and the
// conductor scans with their own token (API calls, as in E2E-7). Needs E2E_PAYMENTS_FAKE=1,
// OTP_DEV_ECHO=1 and a seeded database.
const API = process.env.E2E_API_URL ?? "http://localhost:4000/api/v1";

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const requested = await request.post(`${API}/auth/otp/request`, {
    data: { channel: "EMAIL", target: email },
  });
  const { devCode } = (await requested.json()) as { devCode?: string };
  expect(devCode, "API must run with OTP_DEV_ECHO=1").toMatch(/^\d{6}$/);
  const verified = await request.post(`${API}/auth/otp/verify`, {
    data: { channel: "EMAIL", target: email, code: devCode },
  });
  return ((await verified.json()) as { accessToken: string }).accessToken;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

test.describe("v3 conductor scans a child card", () => {
  test.skip(
    process.env.E2E_PAYMENTS_FAKE !== "1",
    "needs the fake payment flag (E2E_PAYMENTS_FAKE=1)",
  );

  test("child card scan is valid and the parent is told", async ({ page, request }) => {
    test.setTimeout(150_000);
    const email = uniqueEmail("v3-child");
    await login(page, email);

    await page.goto("/passes/buy");
    await page.getByText("This pass is for my child", { exact: true }).click();
    await page.getByLabel("Name of the child").fill("Anu");
    await page.getByLabel("Age", { exact: true }).fill("9");
    await page.getByRole("button", { name: /^buy weekly pass for/i }).click();
    await page.waitForURL((url) => url.pathname === "/passes", { timeout: 20_000 });
    await page.getByRole("button", { name: /^activate pass$/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^activate pass$/i })
      .click();
    await expect(page.getByRole("img", { name: /pass qr code/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // The phone's QR: the token plus the HMAC of the current step with the rotating secret
    const parent = await apiToken(request, email);
    const passes = (await (
      await request.get(`${API}/passes`, { headers: auth(parent) })
    ).json()) as { id: string }[];
    expect(passes).toHaveLength(1);
    const rot = (await (
      await request.get(`${API}/passes/${passes[0]!.id}/qr`, { headers: auth(parent) })
    ).json()) as { token: string; rotSecret: string | null; periodSec: number; serverTime: string };
    expect(rot.rotSecret).not.toBeNull();
    const step = qrStep(Date.now(), Date.parse(rot.serverTime) - Date.now(), rot.periodSec);
    const digest = createHmac("sha256", Buffer.from(rot.rotSecret!, "base64url"))
      .update(stepMessage(step))
      .digest();
    const qr = buildQrContent(rot.token, formatCode(digest));

    // The seeded Kurnool trip is shared by the driver and the conductor; the driver starts it
    const tripId = execFileSync(
      process.execPath,
      [resolve(__dirname, "../../api/node_modules/tsx/dist/cli.mjs"), "scripts/demo-tracking.ts"],
      { cwd: resolve(__dirname, "../../api"), encoding: "utf8" },
    ).trim();
    const driver = {
      ...auth(await apiToken(request, "driver.knl@aptransit.test")),
      "X-Device-Key": "sim_driver_key_kurnool_01",
    };
    expect(
      (await request.post(`${API}/driver/trips/${tripId}/start`, { headers: driver })).status(),
    ).toBe(200);
    try {
      const conductor = await apiToken(request, "conductor.knl@aptransit.test");
      const scan = await request.post(`${API}/tickets/validate`, {
        headers: auth(conductor),
        data: { qr, tripId, deviceTime: new Date().toISOString() },
      });
      expect(scan.status()).toBe(200);
      expect(await scan.json()).toMatchObject({ result: "VALID", reason: "OK" });
    } finally {
      await request.post(`${API}/driver/trips/${tripId}/end`, { headers: driver });
    }

    await expect
      .poll(
        async () => {
          const list = (await (
            await request.get(`${API}/notifications`, { headers: auth(parent) })
          ).json()) as { items: { type: string; params: { child?: string } }[] };
          return list.items.find((n) => n.type === "CHILD_BOARDED")?.params.child;
        },
        { timeout: 15_000 },
      )
      .toBe("Anu");
  });
});
