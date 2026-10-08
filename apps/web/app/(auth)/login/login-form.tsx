"use client";

import {
  AuthVerifyResponse,
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
import { Info, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";
import { useAuth, useMe } from "../../../components/auth-provider";
import { api, type ApiError, errorKey, isApiError } from "../../../lib/api";
import { writePreferenceCookie } from "../../../lib/preferences";
import { roleHome, safeNextPath } from "../../../lib/roles";

const CODE_LENGTH = 6;

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

export function LoginForm({ next }: { next: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const { status, login } = useAuth();
  const me = useMe();
  const safeNext = safeNextPath(next);

  const [channel, setChannel] = useState<OtpChannel>("EMAIL");
  const [email, setEmail] = useState("");
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
  useEffect(() => {
    if (status === "authenticated" && me.data) router.replace(safeNext ?? roleHome(me.data));
  }, [status, me.data, safeNext, router]);

  const describe = (error: unknown): string => {
    if (isApiError(error) && error.code === "RATE_LIMITED" && error.retryAfterSec) {
      return t("login.errors.rateLimited", { seconds: error.retryAfterSec });
    }
    return t(errorKey(error, (k) => t.has(k)));
  };

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
    onSuccess: (result) => {
      // The account language wins on this device after login (docs/11 /account, language).
      // A full load renders every layout in that language; the marker cookie restores the session.
      if (document.documentElement.lang !== result.user.preferredLocale) {
        writePreferenceCookie("locale", result.user.preferredLocale);
        window.location.replace(safeNext ?? roleHome(result.user));
        return;
      }
      login(result);
    },
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
    <Card padding="lg" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t("auth.login")}</h1>
        <p className="text-body text-muted">{t("login.intro")}</p>
      </div>

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
    </Card>
  );
}

interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: "true";
  ref?: Ref<HTMLInputElement>;
}

/** 10 digit Indian mobile number after a fixed +91 (the API expects +91 followed by 10 digits). */
function PhoneInput({ value, onChange, ref, ...a11y }: PhoneInputProps) {
  return (
    <div className="flex items-stretch">
      <span
        className="inline-flex items-center rounded-l-md border border-r-0 border-strong bg-surface px-3 text-body text-muted"
        aria-hidden="true"
      >
        +91
      </span>
      <Input
        ref={ref}
        {...a11y}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        className="rounded-l-none tabular-nums"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 10))}
      />
    </div>
  );
}
