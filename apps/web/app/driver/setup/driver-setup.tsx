"use client";

import { RegisterDeviceInput, RegisterDeviceResult } from "@aptransit/shared";
import { Button, Card, Field, Input } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api, errorKey } from "../../../lib/api";
import { saveDeviceKey } from "../../../lib/driver-device";
import { useDriverToday } from "../../../lib/driver-today";

/** Register once; the page then checks every 30 s until the depot approves this phone. */
export function DriverSetup() {
  const t = useTranslations("driverApp");
  const tRoot = useTranslations();
  const queryClient = useQueryClient();
  const today = useDriverToday(30_000);
  const [label, setLabel] = useState("");
  const [invalid, setInvalid] = useState(false);

  const register = useMutation({
    mutationFn: (body: RegisterDeviceInput) => api("/driver/devices", { method: "POST", body, schema: RegisterDeviceResult }),
    onSuccess: (result) => {
      // Shown once by the API: this phone keeps it, the server only has its hash
      saveDeviceKey(result.deviceKey);
      void queryClient.invalidateQueries({ queryKey: ["driver"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = RegisterDeviceInput.safeParse({ label });
    setInvalid(!parsed.success);
    if (parsed.success) register.mutate(parsed.data);
  };

  const state = today.deviceKey ? today.data?.thisDevice : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Button asChild variant="ghost" size="lg">
          <Link href="/driver">
            <ArrowLeft className="size-5" aria-hidden="true" />
            {t("setup.back")}
          </Link>
        </Button>
      </div>
      <h1 className="text-h1 text-fg">{t("setup.title")}</h1>

      {state === "APPROVED" ? (
        <Card padding="lg" role="status" className="flex items-center gap-3">
          <CircleCheck className="size-7 shrink-0 text-status-success" aria-hidden="true" />
          <p className="text-body-lg text-fg">{t("setup.approved")}</p>
        </Card>
      ) : state === "PENDING" ? (
        <Card padding="lg" role="status" className="flex items-center gap-3">
          <Clock className="size-7 shrink-0 text-status-warning" aria-hidden="true" />
          <p className="text-body-lg text-fg">{t("setup.pending")}</p>
        </Card>
      ) : (
        <Card padding="lg">
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <p className="text-body-lg text-muted">{t("setup.intro")}</p>
            <Field id="device-label" label={t("setup.labelField")} hint={t("setup.labelHint")} error={invalid ? t("setup.labelError") : undefined} required>
              <Input id="device-label" value={label} onChange={(e) => setLabel(e.target.value)} className="h-14 text-body-lg" aria-invalid={invalid ? true : undefined} />
            </Field>
            {register.error && (
              <p role="alert" className="text-body text-status-danger">
                {tRoot(errorKey(register.error, (k) => tRoot.has(k)))}
              </p>
            )}
            <Button type="submit" size="xl" loading={register.isPending}>
              {t("setup.register")}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
