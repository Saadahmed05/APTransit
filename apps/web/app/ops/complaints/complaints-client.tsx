"use client";
import {
  COMPLAINT_NEXT_STATUS,
  ComplaintDto,
  ComplaintStatus,
  formatDate,
  formatTime,
  UpdateComplaintInput,
} from "@aptransit/shared";
import { Button, DataTable, Field, Sheet, SheetContent, SheetDescription, SheetTitle, Textarea, ToneChip } from "@aptransit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";
import { useMe } from "../../../components/auth-provider";
import { api } from "../../../lib/api";
import { useOpsFilters, useOpsQuery } from "../../../lib/ops";
import { FilterSelect, OpsEmpty, OpsError, WriteError } from "../ops-common";

const TONE: Record<ComplaintStatus, "info" | "warning" | "success" | "neutral"> = {
  RECEIVED: "info",
  IN_REVIEW: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

/** /ops/complaints (plan sec 41): list with a status filter, detail drawer, one step status change. */
export function ComplaintsClient() {
  const t = useTranslations("opsApp.complaints"),
    f = useTranslations("feedbackPage"),
    locale = useLocale(),
    { params, set, depotId } = useOpsFilters();
  const status = params.get("status") ?? "";
  const q = useOpsQuery("/ops/complaints", z.array(ComplaintDto), { status: status || undefined, depotId });
  const [openId, setOpenId] = useState<string | null>(null);
  const open = q.data?.find((c) => c.id === openId) ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-h1">{t("title")}</h1>
      <div className="max-w-xs">
        <FilterSelect label={t("status")} value={status} onChange={(v) => set("status", v)}>
          <option value="">{t("allStatuses")}</option>
          {ComplaintStatus.options.map((s) => (
            <option key={s} value={s}>
              {f(`statuses.${s}`)}
            </option>
          ))}
        </FilterSelect>
      </div>
      {q.isError ? (
        <OpsError error={q.error} retry={() => void q.refetch()} />
      ) : (
        <DataTable
          label={t("title")}
          loading={q.isPending}
          rows={q.data ?? []}
          rowKey={(c) => c.id}
          empty={<OpsEmpty />}
          onRowClick={(c) => setOpenId(c.id)}
          columns={[
            { id: "code", header: t("code"), cell: (c) => c.code, sortValue: (c) => c.code },
            { id: "created", header: t("created"), cell: (c) => `${formatDate(c.createdAt, locale)} ${formatTime(c.createdAt, locale)}`, sortValue: (c) => c.createdAt },
            { id: "category", header: t("category"), cell: (c) => f(`categories.${c.category}`), sortValue: (c) => c.category },
            { id: "status", header: t("status"), cell: (c) => <ToneChip tone={TONE[c.status]} label={f(`statuses.${c.status}`)} />, sortValue: (c) => c.status },
            { id: "route", header: t("route"), cell: (c) => c.routeCode ?? "", sortValue: (c) => c.routeCode ?? "" },
            { id: "depot", header: t("depot"), cell: (c) => (locale === "te" ? c.depotNameTe : c.depotNameEn) ?? "" },
            { id: "assigned", header: t("assignedTo"), cell: (c) => c.assignedToName ?? t("nobody") },
          ]}
        />
      )}
      {open && <ComplaintDrawer complaint={open} close={() => setOpenId(null)} />}
    </div>
  );
}

function ComplaintDrawer({ complaint: c, close }: { complaint: ComplaintDto; close: () => void }) {
  const t = useTranslations("opsApp.complaints"),
    f = useTranslations("feedbackPage"),
    all = useTranslations(),
    locale = useLocale(),
    me = useMe(),
    client = useQueryClient();
  const next = COMPLAINT_NEXT_STATUS[c.status];
  const [note, setNote] = useState(c.resolutionNote ?? "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const write = useMutation({
    mutationFn: (body: UpdateComplaintInput) => api(`/ops/complaints/${c.id}`, { method: "PATCH", body, schema: ComplaintDto }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["ops"] }),
  });
  const move = () => {
    if (!next) return;
    const body = { status: next, ...(next === "RESOLVED" || note.trim() ? { resolutionNote: note.trim() } : {}) };
    const parsed = UpdateComplaintInput.safeParse(body);
    if (!parsed.success) {
      setNoteError(t("noteRequired"));
      document.getElementById("cmp-note")?.focus();
      return;
    }
    setNoteError(null);
    write.mutate(parsed.data);
  };
  const facts: Array<[string, string | null]> = [
    [t("email"), c.email],
    [f("ticketCode"), c.ticketCode],
    [f("busRegNo"), c.busRegNo],
    [f("routeCode"), c.routeCode],
    [f("travelDate"), c.travelDate ? formatDate(c.travelDate, locale) : null],
    [t("depot"), (locale === "te" ? c.depotNameTe : c.depotNameEn) ?? null],
    [t("assignedTo"), c.assignedToName],
  ];
  return (
    <Sheet open onOpenChange={(v) => !v && !write.isPending && close()}>
      <SheetContent closeLabel={all("common.close")} className="overflow-y-auto">
        <SheetTitle>{c.code}</SheetTitle>
        <SheetDescription>
          {f(`categories.${c.category}`)}, {f(`statuses.${c.status}`)}
        </SheetDescription>
        <div className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap break-words rounded-md bg-surface p-3">{c.message}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-small text-muted">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {next && (
            <>
              <Field
                id="cmp-note"
                label={next === "RESOLVED" ? t("noteRequiredLabel") : t("noteOptional")}
                error={noteError ?? undefined}
                required={next === "RESOLVED"}
              >
                <Textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <Button onClick={move} disabled={write.isPending} aria-busy={write.isPending}>
                {t(`moveTo.${next}`)}
              </Button>
            </>
          )}
          {me.data && c.assignedToId !== me.data.id && (
            <Button variant="secondary" disabled={write.isPending} onClick={() => write.mutate({ assignedToId: me.data!.id })}>
              {t("assignToMe")}
            </Button>
          )}
          <WriteError error={write.error} />
          {write.isSuccess && (
            <p role="status" className="text-status-success">
              {t("saved")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
