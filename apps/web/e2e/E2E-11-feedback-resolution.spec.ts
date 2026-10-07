import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import { login, uniqueEmail } from "./helpers";

// docs/14 E2E-11: feedback submit, code shown, ops moves it to resolved, the citizen sees it.
// Needs the real API with OTP_DEV_ECHO=1 (staff login) and a seeded database.

test("E2E-11 Feedback: submit as a guest, ops resolves, status shows the note", async ({ browser }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("e2e-feedback");
  const note = `Driver counselled about punctuality (${Date.now()}).`;

  // 1. Guest sends feedback about a Kurnool route (the route code routes it to the Kurnool depot)
  const guest = await browser.newPage();
  await guest.goto("/feedback");
  await guest.getByLabel(en.feedbackPage.email).fill(email);
  await guest.getByText(en.feedbackPage.categories.DELAY, { exact: true }).click();
  await guest.getByLabel(en.feedbackPage.message).fill("The 06:30 bus left the stand 25 minutes late without any announcement.");
  await guest.getByText(en.feedbackPage.addTripDetails).click();
  await guest.getByLabel(en.feedbackPage.routeCode).fill("KNL-VJA-01");
  await guest.getByRole("button", { name: en.feedbackPage.submit }).click();
  await expect(guest.getByRole("heading", { name: en.feedbackPage.sentTitle })).toBeVisible();
  const code = (await guest.getByText(/^CMP-[0-9A-Z]{6}$/).textContent())!.trim();

  // 2. Depot staff move it RECEIVED to IN_REVIEW to RESOLVED with a note
  const staff = await (await browser.newContext()).newPage();
  await staff.setViewportSize({ width: 1280, height: 900 });
  await login(staff, "staff.knl@aptransit.test", "/ops/complaints");
  await staff.getByRole("cell", { name: code }).click();
  await staff.getByRole("button", { name: en.opsApp.complaints.moveTo.IN_REVIEW }).click();
  await expect(staff.getByRole("button", { name: en.opsApp.complaints.moveTo.RESOLVED })).toBeVisible();
  await staff.getByLabel(en.opsApp.complaints.noteRequiredLabel).fill(note);
  await staff.getByRole("button", { name: en.opsApp.complaints.moveTo.RESOLVED }).click();
  await expect(staff.getByRole("button", { name: en.opsApp.complaints.moveTo.CLOSED })).toBeVisible();

  // 3. The guest sees the resolution with the depot note
  await guest.goto(`/feedback/status?code=${code}`);
  await guest.getByLabel(en.feedbackPage.email).fill(email);
  await guest.getByRole("button", { name: en.feedbackPage.check }).click();
  await expect(guest.getByRole("heading", { name: en.feedbackPage.statusOf.replace("{code}", code) })).toBeVisible();
  await expect(guest.getByText(en.feedbackPage.statuses.RESOLVED)).toBeVisible();
  await expect(guest.getByText(note)).toBeVisible();

  // 4. A wrong email gets the generic not found message
  await guest.getByLabel(en.feedbackPage.email).fill("someone.else@example.test");
  await guest.getByRole("button", { name: en.feedbackPage.check }).click();
  await expect(guest.getByRole("alert")).toBeVisible();
});
