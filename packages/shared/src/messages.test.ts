import { describe, expect, it } from "vitest";
import { NotificationType } from "./enums";
import { emailText, formatTemplate, notificationText, SHARED_MESSAGES } from "./messages";
import { notificationParams } from "./notification-params";

describe("shared messages", () => {
  it("has a title and body for every notification type in both languages", () => {
    for (const locale of ["en", "te"] as const) {
      for (const type of NotificationType.options) {
        const entry = SHARED_MESSAGES[locale].notifications[type];
        expect(entry.title.length).toBeGreaterThan(0);
        expect(entry.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("formats placeholders and keeps unknown ones", () => {
    expect(formatTemplate("Seat {seat} on {route}", { seat: 18 })).toBe("Seat 18 on {route}");
  });

  it("renders BOOKING_CONFIRMED from stored params in each language", () => {
    const stored = { routeEn: "Kurnool to Vijayawada", routeTe: "కర్నూలు నుండి విజయవాడ", departureAt: "2026-09-23T01:00:00.000Z", seat: "18" };
    const en = notificationText("en", "BOOKING_CONFIRMED", notificationParams(stored, "en"));
    expect(en.title).toBe("Ticket booked");
    expect(en.body).toMatch(/^Kurnool to Vijayawada, Wed, 23 Sept? at 06:30\s*am\. Seat 18\.$/i);
    const te = notificationText("te", "BOOKING_CONFIRMED", notificationParams(stored, "te"));
    expect(te.body).toContain("కర్నూలు నుండి విజయవాడ");
    expect(te.body).not.toContain("{");
  });

  it("gives {when} for validUntil and drops other language names", () => {
    const params = notificationParams({ passNameEn: "Weekly pass", passNameTe: "వారపు పాస్", validUntil: "2026-09-17T02:30:00.000Z" }, "en");
    expect(params.passName).toBe("Weekly pass");
    expect(params).not.toHaveProperty("passNameTe");
    expect(String(params.when)).toMatch(/17 Sept?, 08:00\s*am/i);
  });

  it("email layout strings exist in both languages", () => {
    for (const locale of ["en", "te"] as const) {
      expect(emailText(locale, "layout.open")).not.toBe("");
      expect(emailText(locale, "layout.footer")).not.toBe("");
    }
    expect(() => emailText("en", "layout.missing")).toThrow();
  });
});
