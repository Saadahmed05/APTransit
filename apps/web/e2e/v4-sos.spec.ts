import { type APIRequestContext, expect, test } from "@playwright/test";

// D-048 Phase 6: the conductor raises an SOS and the driver reports a delay with minutes. Both are
// API calls with the crew's own tokens (as in E2E-7), and the ops incident list shows them.
const API = process.env.E2E_API_URL ?? "http://localhost:4000/api/v1";

async function token(request: APIRequestContext, email: string): Promise<string> {
  const requested = await request.post(`${API}/auth/otp/request`, { data: { channel: "EMAIL", target: email } });
  const { devCode } = (await requested.json()) as { devCode?: string };
  expect(devCode, "API must run with OTP_DEV_ECHO=1").toMatch(/^\d{6}$/);
  const verified = await request.post(`${API}/auth/otp/verify`, { data: { channel: "EMAIL", target: email, code: devCode } });
  return ((await verified.json()) as { accessToken: string }).accessToken;
}

test.describe("D-048 crew SOS and delay minutes", () => {
  test.skip(process.env.E2E_PAYMENTS_FAKE !== "1", "needs the seeded development stack");

  test("conductor SOS is CRITICAL and a delay report carries its minutes", async ({ request }) => {
    test.setTimeout(90_000);
    const conductor = { authorization: `Bearer ${await token(request, "conductor.knl@aptransit.test")}` };
    const sos = await request.post(`${API}/conductor/sos`, { headers: conductor });
    expect(sos.status(), await sos.text()).toBe(201);
    expect(await sos.json()).toMatchObject({ type: "SOS", severity: "CRITICAL", status: "OPEN" });

    const driver = { authorization: `Bearer ${await token(request, "driver.knl@aptransit.test")}` };
    const delay = await request.post(`${API}/driver/incidents`, { headers: driver, data: { type: "DELAY", delayMinutes: 9 } });
    expect(delay.status(), await delay.text()).toBe(201);
    expect((await delay.json()).note).toContain("9 min late");
    const bad = await request.post(`${API}/driver/incidents`, { headers: driver, data: { type: "TRAFFIC", delayMinutes: 9 } });
    expect(bad.status()).toBe(400);
  });
});
