"use client";

import {
  ContactOtpRequestInput,
  ContactOtpRequestResponse,
  MeDto,
  type OtpChannel,
  maskEmail,
  maskPhone,
} from "@aptransit/shared";
import { Button, Field, Input, OtpInput, toast } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { api, errorKey } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { PhoneInput } from "./phone-input";

const CODE_LENGTH = 6;

interface Sent {
  target: string;
  devCode?: string;
}

export interface ContactVerifyProps {
  channel: OtpChannel;
  /** Prefix for element ids, so two of these can sit on one page. */
  idPrefix: string;
  /** Called after the contact is verified, or stored without a code (phone, no SMS provider). */
  onDone?: () => void;
}

/**
 * D-048: add or change an email or phone. Sends a code to the new contact and checks it
 * (POST /me/contact/otp/request, then /verify). Used by /welcome and the account page.
 */
export function ContactVerify({ channel, idPrefix, onDone }: ContactVerifyProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const otpGroup = useRef<HTMLDivElement>(null);

  const describe = (error: unknown) => t(errorKey(error, (k) => t.has(k)));

  const request = useMutation({
    mutationFn: (input: ContactOtpRequestInput) =>
      api("/me/contact/otp/request", { method: "POST", body: input, schema: ContactOtpRequestResponse }),
    onSuccess: (res, input) => {
      if (res.saved) {
        // No SMS provider yet: the number is stored and shown as not verified
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
        toast.success(t("contact.savedUnverified"));
        setValue("");
        onDone?.();
        return;
      }
      setSent({ target: input.target, devCode: res.devCode });
      setCode("");
      setCodeError(null);
      window.setTimeout(() => otpGroup.current?.querySelector("input")?.focus(), 0);
    },
    onError: (error) => setTargetError(describe(error)),
  });

  const verify = useMutation({
    mutationFn: (input: { code: string; target: string }) =>
      api("/me/contact/otp/verify", { method: "POST", body: { channel, ...input }, schema: MeDto }),
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.me, me);
      toast.success(t(channel === "EMAIL" ? "contact.emailVerified" : "contact.phoneVerified"));
      setSent(null);
      setValue("");
      onDone?.();
    },
    onError: (error) => {
      setCodeError(describe(error));
      setCode("");
      window.setTimeout(() => otpGroup.current?.querySelector("input")?.focus(), 0);
    },
  });

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    setTargetError(null);
    const target = channel === "EMAIL" ? value.trim() : `+91${value}`;
    const parsed = ContactOtpRequestInput.safeParse({ channel, target });
    if (!parsed.success) {
      setTargetError(channel === "EMAIL" ? t("login.errors.email") : t("login.errors.phone"));
      return;
    }
    request.mutate(parsed.data);
  };

  const submitCode = (entered: string) => {
    if (!sent || entered.length !== CODE_LENGTH || verify.isPending) return;
    setCodeError(null);
    verify.mutate({ code: entered, target: sent.target });
  };

  if (sent) {
    const shown = channel === "EMAIL" ? maskEmail(sent.target) : maskPhone(sent.target);
    return (
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submitCode(code);
        }}
      >
        <p className="text-body text-muted">{t("contact.codeSent", { target: shown })}</p>
        {sent.devCode ? (
          <p className="flex items-start gap-2 rounded-md bg-status-info-soft p-3 text-small text-fg">
            <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
            {t("login.devCode", { code: sent.devCode })}
          </p>
        ) : null}
        <OtpInput
          ref={otpGroup}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (codeError) setCodeError(null);
          }}
          onComplete={submitCode}
          length={CODE_LENGTH}
          disabled={verify.isPending}
          invalid={codeError !== null}
          groupLabel={t("auth.enterOtp")}
          digitLabel={(position, total) => t("login.digit", { position, total })}
          describedBy={codeError ? `${idPrefix}-code-error` : undefined}
        />
        {codeError ? (
          <p id={`${idPrefix}-code-error`} role="alert" className="text-small text-status-danger">
            {codeError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={verify.isPending} disabled={code.length !== CODE_LENGTH}>
            {t("contact.verify")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSent(null);
              setCode("");
              setCodeError(null);
            }}
          >
            {t(channel === "EMAIL" ? "login.changeEmail" : "login.changePhone")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={sendCode} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <Field
        id={`${idPrefix}-input`}
        label={t(channel === "EMAIL" ? "login.emailLabel" : "login.phoneLabel")}
        hint={channel === "PHONE" ? t("login.phoneHint") : undefined}
        error={targetError ?? undefined}
        className="min-w-0 flex-1"
      >
        {channel === "EMAIL" ? (
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("login.emailPlaceholder")}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
        ) : (
          <PhoneInput value={value} onChange={setValue} />
        )}
      </Field>
      <Button type="submit" className="sm:mt-8" loading={request.isPending}>
        {t("login.sendCode")}
      </Button>
    </form>
  );
}
