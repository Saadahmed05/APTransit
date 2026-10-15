import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../../common/errors/app-error";
import { AuthService } from "./auth.service";

const CLIENT_ID = "123-abc.apps.googleusercontent.com";

type TestUser = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  preferredLocale: string;
  deletedAt: Date | null;
  userRoles: Array<{
    id: string;
    role: string;
    depotId: string | null;
    districtId: string | null;
    stateId: string | null;
  }>;
};

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: CLIENT_ID,
    iss: "https://accounts.google.com",
    exp: String(Math.floor(Date.now() / 1000) + 300),
    email_verified: "true",
    email: "new@example.com",
    name: "New Citizen",
    ...overrides,
  };
}

function tokenInfo(body: Record<string, unknown>, ok = true): Response {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

function setup(options: { clientId?: string; existing?: TestUser } = {}) {
  const users: TestUser[] = options.existing ? [options.existing] : [];
  const auditLog = vi.fn(async () => undefined);
  const createUser = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const user: TestUser = {
      id: `user-${users.length + 1}`,
      name: (data.name as string | null | undefined) ?? null,
      email: (data.email as string | null | undefined) ?? null,
      phone: (data.phone as string | null | undefined) ?? null,
      preferredLocale: (data.preferredLocale as string | undefined) ?? "en",
      deletedAt: null,
      userRoles: [
        {
          id: `role-${users.length + 1}`,
          role: "CITIZEN",
          depotId: null,
          districtId: null,
          stateId: null,
        },
      ],
    };
    users.push(user);
    return user;
  });
  const prisma = {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { email: string } }) =>
        users.find((user) => user.email?.toLowerCase() === where.email.toLowerCase()) ?? null,
      ),
      create: createUser,
    },
    userRole: { create: vi.fn() },
    refreshToken: { create: vi.fn(async () => ({ id: "refresh-1" })) },
  };
  const config = {
    get: vi.fn((key: string) => {
      if (key === "GOOGLE_CLIENT_ID") return options.clientId;
      if (key === "JWT_SECRET") return "test-jwt-secret-that-is-long-enough";
      if (key === "OTP_PEPPER") return "test-otp-pepper";
      if (key === "APP_ENV") return "test";
      return undefined;
    }),
  };
  const service = new AuthService(
    prisma as never,
    { client: {} } as never,
    config as never,
    {} as never,
    { log: auditLog } as never,
    { sendEmail: vi.fn() } as never,
  );
  return { service, users, createUser, auditLog };
}

function existingUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "existing-user",
    name: "OTP Citizen",
    email: "existing@example.com",
    phone: null,
    preferredLocale: "en",
    deletedAt: null,
    userRoles: [
      {
        id: "existing-role",
        role: "CITIZEN",
        depotId: null,
        districtId: null,
        stateId: null,
      },
    ],
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: AppError["code"]): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("AuthService.googleSignIn", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a citizen, issues tokens and audits a valid Google login", async () => {
    const { service, users, createUser, auditLog } = setup({ clientId: CLIENT_ID });
    vi.mocked(fetch).mockResolvedValue(tokenInfo(claims()));

    const result = await service.googleSignIn("valid-credential", "127.0.0.1", "test-agent");

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.email).toBe("new@example.com");
    expect(users).toHaveLength(1);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@example.com", name: "New Citizen" }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.login", after: { method: "google" } }),
    );
  });

  it("signs into an existing OTP user without creating another user", async () => {
    const user = existingUser();
    const { service, users, createUser } = setup({ clientId: CLIENT_ID, existing: user });
    vi.mocked(fetch).mockResolvedValue(
      tokenInfo(claims({ email: "existing@example.com", name: "Ignored Google Name" })),
    );

    const result = await service.googleSignIn("valid-credential", "127.0.0.1");

    expect(result.user.id).toBe(user.id);
    expect(users).toHaveLength(1);
    expect(createUser).not.toHaveBeenCalled();
  });

  it.each([
    ["another audience", { aud: "other.apps.googleusercontent.com" }],
    ["an unverified email", { email_verified: "false" }],
    ["the wrong issuer", { iss: "https://example.com" }],
    ["an expired token", { exp: String(Math.floor(Date.now() / 1000) - 1) }],
  ])("rejects %s with UNAUTHENTICATED", async (_name, override) => {
    const { service } = setup({ clientId: CLIENT_ID });
    vi.mocked(fetch).mockResolvedValue(tokenInfo(claims(override)));

    await expectAppError(
      service.googleSignIn("invalid-credential", "127.0.0.1"),
      "UNAUTHENTICATED",
    );
  });

  it.each([
    ["a tokeninfo rejection", () => Promise.resolve(tokenInfo({}, false))],
    ["a network failure", () => Promise.reject(new Error("network failed"))],
    ["a timeout", () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
  ])("maps %s to UNAUTHENTICATED", async (_name, response) => {
    const { service } = setup({ clientId: CLIENT_ID });
    vi.mocked(fetch).mockImplementation(response as typeof fetch);

    await expectAppError(
      service.googleSignIn("invalid-credential", "127.0.0.1"),
      "UNAUTHENTICATED",
    );
  });

  it("refuses a deleted user", async () => {
    const user = existingUser({ deletedAt: new Date() });
    const { service } = setup({ clientId: CLIENT_ID, existing: user });
    vi.mocked(fetch).mockResolvedValue(tokenInfo(claims({ email: user.email })));

    await expectAppError(service.googleSignIn("valid-credential", "127.0.0.1"), "FORBIDDEN");
  });

  it("normalises the Google email before creating the user", async () => {
    const { service, users } = setup({ clientId: CLIENT_ID });
    vi.mocked(fetch).mockResolvedValue(tokenInfo(claims({ email: "Email@Example.COM" })));

    await service.googleSignIn("valid-credential", "127.0.0.1");

    expect(users[0]?.email).toBe("email@example.com");
  });

  it("refuses an unset client id without calling Google", async () => {
    const { service } = setup();

    await expectAppError(service.googleSignIn("valid-credential", "127.0.0.1"), "FORBIDDEN");
    expect(fetch).not.toHaveBeenCalled();
  });
});
