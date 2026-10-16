"use client";

import {
  AuthVerifyResponse,
  type MeDto,
  maskEmail,
  maskPhone,
  type OtpChannel,
  OtpRequestInput,
  OtpRequestResponse,
} from "@aptransit/shared";
import {
  Button,
  Card,
  Field,
  Input,
  OtpInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aptransit/ui";
import { useMutation } from "@tanstack/react-query";
import { Bus, BusFront, Info, Landmark, Mail, Phone, ScanLine, ShieldCheck, Warehouse } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth, useMe } from "../../../components/auth-provider";
import { PhoneInput } from "../../../components/phone-input";
import { GoogleSignIn, googleSignInEnabled } from "../../../components/google-sign-in";
import { api, type ApiError, errorKey, isApiError } from "../../../lib/api";
import { needsProfile, welcomeHref } from "../../../lib/profile";
import { writePreferenceCookie } from "../../../lib/preferences";
import { roleHome, safeNextPath } from "../../../lib/roles";

const CODE_LENGTH = 6;

/** D-048: a citizen with an incomplete profile goes to /welcome first, then on to where they were going. */
function destination(user: MeDto, safeNext: string | null): string {
  return needsProfile(user) ? welcomeHref(safeNext) : (safeNext ?? roleHome(user));
}

interface Sent {
  channel: OtpChannel;
  target: string;
  expiresInSec: number;
  resendAt: number;
  /** Only sent by a non production API with OTP_DEV_ECHO=1, when codes are not emailed. */
  devCode?: string;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function LoginForm({ next, initialEmail = null }: { next: string | null; initialEmail?: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const { status, login, logout } = useAuth();
  const me = useMe();
  const safeNext = safeNextPath(next);

  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const otpGroup = useRef<HTMLDivElement>(null);
  const now = useNow(sent !== null);

  // The code step replaces the form: move focus to the first box so keyboard and screen reader users follow.
  const codeStep = sent !== null;
  useEffect(() => {
    if (codeStep) otpGroup.current?.querySelector("input")?.focus();
  }, [codeStep]);

  // Logged in (just now, or already when opening /login): go to `next` or the role home.
  // A demo staff link while signed in with another account: sign out first, then the form is ready.
  useEffect(() => {
    if (status !== "authenticated" || !me.data) return;
    if (initialEmail && me.data.email !== initialEmail) {
      void logout(`${window.location.pathname}${window.location.search}`);
      return;
    }
    router.replace(destination(me.data, safeNext));
  }, [status, me.data, safeNext, router, initialEmail, logout]);

  const describe = (error: unknown): string => {
    if (isApiError(error) && error.code === "RATE_LIMITED" && error.retryAfterSec) {
      return t("login.errors.rateLimited", { seconds: error.retryAfterSec });
    }
    return t(errorKey(error, (k) => t.has(k)));
  };

  const signedIn = (result: AuthVerifyResponse) => {
    // The account language wins on this device after login (docs/11 /account, language).
    // A full load renders every layout in that language; the marker cookie restores the session.
    if (document.documentElement.lang !== result.user.preferredLocale) {
      writePreferenceCookie("locale", result.user.preferredLocale);
      window.location.replace(destination(result.user, safeNext));
      return;
    }
    login(result);
  };
  const [googleError, setGoogleError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: (input: OtpRequestInput) =>
      api("/auth/otp/request", {
        method: "POST",
        body: input,
        schema: OtpRequestResponse,
        redirectOn401: false,
      }),
    onSuccess: (res, input) => {
      setSent({
        channel: input.channel,
        target: input.target,
        expiresInSec: res.expiresInSec,
        resendAt: Date.now() + res.resendInSec * 1000,
        devCode: res.devCode,
      });
      setCode("");
      setCodeError(null);
    },
    onError: (error) => setTargetError(describe(error)),
  });

  const verify = useMutation({
    mutationFn: (input: { channel: OtpChannel; target: string; code: string }) =>
      api("/auth/otp/verify", {
        method: "POST",
        body: input,
        schema: AuthVerifyResponse,
        redirectOn401: false,
      }),
    onSuccess: (result) => signedIn(result),
    onError: (error: ApiError | Error) => {
      setCodeError(describe(error));
      if (isApiError(error) && (error.code === "OTP_INVALID" || error.code === "VALIDATION_FAILED"))
        setCode("");
      // The boxes were disabled while checking, so focus fell to the page. Put it back for the next try.
      window.setTimeout(() => otpGroup.current?.querySelector("input")?.focus(), 0);
    },
  });

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    setTargetError(null);
    const target = channel === "EMAIL" ? email.trim() : `+91${phone}`;
    const parsed = OtpRequestInput.safeParse({ channel, target });
    if (!parsed.success) {
      setTargetError(channel === "EMAIL" ? t("login.errors.email") : t("login.errors.phone"));
      targetInput.current?.focus();
      return;
    }
    request.mutate(parsed.data);
  };

  const submitCode = (value: string) => {
    if (!sent || value.length !== CODE_LENGTH || verify.isPending) return;
    setCodeError(null);
    verify.mutate({ channel: sent.channel, target: sent.target, code: value });
  };

  const changeTarget = () => {
    setSent(null);
    setCode("");
    setCodeError(null);
    verify.reset();
    // Focus returns to the input the user is about to change
    window.setTimeout(() => targetInput.current?.focus(), 0);
  };

  if (sent) {
    const secondsLeft = Math.max(0, Math.ceil((sent.resendAt - now) / 1000));
    const shownTarget = sent.channel === "EMAIL" ? maskEmail(sent.target) : maskPhone(sent.target);
    return (
      <Card padding="lg" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-fg">{t("auth.enterOtp")}</h1>
          <p className="text-body text-muted">
            {t("login.codeSent", {
              target: shownTarget,
              minutes: Math.round(sent.expiresInSec / 60),
            })}
          </p>
          {sent.devCode ? (
            <p className="flex items-start gap-2 rounded-md bg-status-info-soft p-3 text-small text-fg">
              <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
              {t("login.devCode", { code: sent.devCode })}
            </p>
          ) : null}
        </div>

        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitCode(code);
          }}
        >
          <OtpInput
            ref={otpGroup}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (codeError) setCodeError(null);
            }}
            onComplete={submitCode}
            length={CODE_LENGTH}
            disabled={verify.isPending || verify.isSuccess}
            invalid={codeError !== null}
            groupLabel={t("auth.enterOtp")}
            digitLabel={(position, total) => t("login.digit", { position, total })}
            describedBy={codeError ? "otp-error" : undefined}
          />
          {codeError ? (
            <p id="otp-error" role="alert" className="text-small text-status-danger">
              {codeError}
            </p>
          ) : null}
          <Button
            type="submit"
            size="xl"
            loading={verify.isPending || verify.isSuccess}
            disabled={code.length !== CODE_LENGTH}
          >
            {t("auth.login")}
          </Button>
        </form>

        <div className="flex flex-col gap-3 border-t border-default pt-4">
          {secondsLeft > 0 ? (
            <p className="text-small text-muted" aria-live="off">
              {t("login.resendIn", { seconds: secondsLeft })}
            </p>
          ) : (
            <Button
              variant="secondary"
              loading={request.isPending}
              onClick={() => request.mutate({ channel: sent.channel, target: sent.target })}
            >
              {t("login.resend")}
            </Button>
          )}
          <Button variant="link" className="self-start" onClick={changeTarget}>
            {sent.channel === "EMAIL" ? t("login.changeEmail") : t("login.changePhone")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-6 shadow-md">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <BusFront className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-h1 text-fg">{t("auth.login")}</h1>
        <p className="text-body text-muted">{t("login.intro")}</p>
      </div>

      {googleSignInEnabled ? (
        <div className="flex flex-col gap-3">
          <GoogleSignIn
            onSignedIn={signedIn}
            onError={(error) =>
              setGoogleError(isApiError(error) ? describe(error) : t("login.googleFailed"))
            }
          />
          {googleError ? (
            <p role="alert" className="text-center text-small text-status-danger">
              {googleError}
            </p>
          ) : null}
          <p className="flex items-center gap-3 text-small text-muted">
            <span className="h-px flex-1 bg-default" aria-hidden="true" />
            {t("login.or")}
            <span className="h-px flex-1 bg-default" aria-hidden="true" />
          </p>
        </div>
      ) : null}

      <Tabs
        value={channel}
        onValueChange={(value) => {
          setChannel(value as OtpChannel);
          setTargetError(null);
        }}
      >
        <TabsList aria-label={t("login.method")} className="grid w-full grid-cols-2">
          <TabsTrigger value="EMAIL" className="min-h-11 gap-2">
            <Mail className="size-4" aria-hidden="true" />
            {t("login.email")}
          </TabsTrigger>
          <TabsTrigger value="PHONE" className="min-h-11 gap-2">
            <Phone className="size-4" aria-hidden="true" />
            {t("login.phone")}
          </TabsTrigger>
        </TabsList>

        {/* The active tab owns the form, so its aria-controls points at a real panel */}
        <TabsContent value={channel} className="mt-6">
          <form noValidate onSubmit={sendCode} className="flex flex-col gap-4">
            {channel === "EMAIL" ? (
              <Field
                id="login-email"
                label={t("login.emailLabel")}
                error={targetError ?? undefined}
              >
                <Input
                  ref={targetInput}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                />
              </Field>
            ) : (
              <>
                <Field
                  id="login-phone"
                  label={t("login.phoneLabel")}
                  hint={t("login.phoneHint")}
                  error={targetError ?? undefined}
                >
                  <PhoneInput ref={targetInput} value={phone} onChange={setPhone} />
                </Field>
                <p className="flex items-start gap-2 rounded-md bg-status-info-soft p-3 text-small text-fg">
                  <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
                  {t("login.phoneNote")}
                </p>
              </>
            )}
            <Button type="submit" size="xl" loading={request.isPending}>
              {t("login.sendCode")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <p className="text-center text-small text-muted">
        {t.rich("login.terms", {
          terms: (chunks) => (
            <Link href="/terms" className="font-medium text-primary underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </p>

      {/* Staff portals: the same sign in, then the role's own app (docs/08 role homes) */}
      <nav aria-labelledby="staff-portals" className="flex flex-col gap-3 border-t border-default pt-5">
        <div className="flex flex-col gap-1">
          <h2 id="staff-portals" className="text-h3 text-fg">
            {t("login.staff.title")}
          </h2>
          <p className="text-small text-muted">{t("login.staff.intro")}</p>
        </div>
        {DEMO_ACCOUNTS && <p className="text-small text-muted">{t("login.staff.demoHint")}</p>}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STAFF_PORTALS.map(({ path, key, Icon, demoEmail }) => (
            <li key={path}>
              <Link
                href={`/login?${new URLSearchParams(DEMO_ACCOUNTS ? { next: path, email: demoEmail } : { next: path }).toString()}`}
                data-testid={`portal-${key}`}
                className="flex min-h-14 items-center gap-3 rounded-md border border-default bg-surface-raised px-3 py-2 text-body font-medium text-fg hover:bg-surface"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  {t(`login.staff.${key}`)}
                  {DEMO_ACCOUNTS && <span className="block truncate text-small font-normal text-muted">{demoEmail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Card>
  );
}

/** Demo deployments (NEXT_PUBLIC_DEMO_ACCOUNTS=1) show the seeded staff emails and fill them in. Never in production. */
const DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS === "1";

const STAFF_PORTALS = [
  { path: "/driver", key: "driver", Icon: Bus, demoEmail: "driver.knl@aptransit.test" },
  { path: "/conductor", key: "conductor", Icon: ScanLine, demoEmail: "conductor.knl@aptransit.test" },
  { path: "/ops", key: "depot", Icon: Warehouse, demoEmail: "manager.knl@aptransit.test" },
  { path: "/gov", key: "gov", Icon: Landmark, demoEmail: "transport@aptransit.test" },
  { path: "/admin", key: "admin", Icon: ShieldCheck, demoEmail: "admin@aptransit.test" },
] as const;
