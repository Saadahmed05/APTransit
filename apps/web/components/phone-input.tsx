"use client";

import { Input } from "@aptransit/ui";
import type { Ref } from "react";

export interface PhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: "true";
  ref?: Ref<HTMLInputElement>;
}

/** 10 digit Indian mobile number after a fixed +91 (the API expects +91 followed by 10 digits). */
export function PhoneInput({ value, onChange, ref, ...a11y }: PhoneInputProps) {
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
