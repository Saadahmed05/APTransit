import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../common/errors/app-error";
import type { Env } from "../../config/env";
import { ResendEmailProvider } from "./email.provider";

function provider(appEnv: Env["APP_ENV"]): ResendEmailProvider {
  const values: Record<string, string> = {
    APP_ENV: appEnv,
    NODE_ENV: "production",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "AP TransitOS <no-reply@example.test>",
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new ResendEmailProvider(config);
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("expected the call to fail");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResendEmailProvider", () => {
  it("sends through Resend outside development", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await provider("staging").sendEmail("rider@example.com", "Your code", "123456");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("never calls Resend in development", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await provider("development").sendEmail("rider@example.com", "Your code", "123456");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws EMAIL_DELIVERY_FAILED (502) when Resend refuses the mail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const error = await failure(provider("staging").sendEmail("rider@example.com", "Your code", "1"));
    expect(error.code).toBe("EMAIL_DELIVERY_FAILED");
    expect(error.status).toBe(502);
  });

  it("throws EMAIL_DELIVERY_FAILED when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const error = await failure(provider("staging").sendEmail("rider@example.com", "Your code", "1"));
    expect(error.code).toBe("EMAIL_DELIVERY_FAILED");
  });
});
