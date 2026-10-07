"use client";
import { Button, ErrorState, EmptyState } from "@aptransit/ui";
import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { api, errorKey } from "../../lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
export function OpsError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations();
  return (
    <ErrorState
      message={t(errorKey(error, (k) => t.has(k)))}
      retryLabel={t("common.retry")}
      onRetry={retry}
    />
  );
}
export function OpsEmpty() {
  const t = useTranslations("opsApp");
  return <EmptyState icon={Inbox} title={t("empty")} hint={t("emptyHint")} />;
}
export function useOpsWrite<T>(schema: z.ZodType<T>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { schema, method: "POST", body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["ops"] });
    },
  });
}
export function WriteError({ error }: { error: unknown }) {
  const t = useTranslations();
  return error ? (
    <p role="alert" className="text-status-danger">
      {t(errorKey(error, (k) => t.has(k)))}
    </p>
  ) : null;
}
export const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-default bg-surface px-3 text-body";
export function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-small">
      <span>{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
export function RetryWrite({ onClick }: { onClick: () => void }) {
  const t = useTranslations("common");
  return (
    <Button variant="secondary" onClick={onClick}>
      {t("retry")}
    </Button>
  );
}
