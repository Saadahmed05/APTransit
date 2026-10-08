import { describe, expect, it } from "vitest";
import { maskUrl, REDACT_PATHS } from "../src/common/logger";

describe("Day 17: log redaction (docs/12, A09)", () => {
  it("masks emails and phone numbers in logged URLs", () => {
    expect(maskUrl("/api/v1/feedback/status?code=CMP-ABC123&email=ravi@example.com")).toBe(
      "/api/v1/feedback/status?code=CMP-ABC123&email=[redacted]",
    );
    expect(maskUrl("/x?phone=9876543210&a=1")).toBe("/x?phone=[redacted]&a=1");
    expect(maskUrl("/api/v1/search/trips?from=a&to=b")).toBe("/api/v1/search/trips?from=a&to=b");
  });

  it("redacts query and body fields with personal data or secrets", () => {
    for (const path of ["req.query.email", "*.email", "*.phone", "*.otp", "*.token", "req.headers.authorization"]) {
      expect(REDACT_PATHS).toContain(path);
    }
  });
});
