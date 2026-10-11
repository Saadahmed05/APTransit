"use client";

import { AdminPassTypeDto, formatMoney } from "@aptransit/shared";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
  ToneChip,
  toast,
} from "@aptransit/ui";
import { FlaskConical, Ticket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { RequirePermission } from "../../../../components/require-auth";
import { useAdminMutation, useAdminQuery } from "../../../../lib/admin";
import { OpsError, WriteError } from "../../../ops/ops-common";

type PassType = AdminPassTypeDto;
interface Draft {
  price: string;
  durationDays: string;
  groupSize: string;
  sortOrder: string;
  isDemo: boolean;
  isActive: boolean;
}

/**
 * D-036 pass catalog editor. Edits apply to new sales only: each sold pass keeps the price,
 * duration, mode, services and group size it was bought with. Kind, scheme and state stay fixed.
 */
export function PassTypesClient() {
  return (
    <RequirePermission anyOf={["policy:write"]}>
      <PassTypesInner />
    </RequirePermission>
  );
}

function PassTypesInner() {
  const t = useTranslations("adminApp.passTypes"),
    admin = useTranslations("adminApp"),
    locale = useLocale();
  const list = useAdminQuery("/admin/pass-types", z.array(AdminPassTypeDto));
  const [editing, setEditing] = useState<PassType | null>(null);
  const name = (p: PassType) => (locale === "te" ? p.nameTe : p.nameEn);
  const validity = (p: PassType) => (p.validityMode === "UNTIL_DAY_END" ? t("untilDayEnd") : t("rollingDays", { days: p.durationDays }));

  return (
    <div className="flex min-w-0 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="text-muted">{t("desc")}</p>
      </div>
      {list.isError ? (
        <OpsError error={list.error} retry={() => void list.refetch()} />
      ) : list.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Ticket} headingLevel="h2" title={t("empty")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-left text-small">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="bg-surface-sunken text-muted">
              <tr>
                <th scope="col" className="p-3 font-medium">{t("name")}</th>
                <th scope="col" className="p-3 font-medium">{t("price")}</th>
                <th scope="col" className="p-3 font-medium">{t("validity")}</th>
                <th scope="col" className="p-3 font-medium">{t("group")}</th>
                <th scope="col" className="p-3 font-medium">{t("active")}</th>
                <th scope="col" className="p-3 font-medium">{t("sold")}</th>
                <th scope="col" className="p-3 font-medium"><span className="sr-only">{t("edit")}</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className="border-t border-default">
                  <th scope="row" className="p-3 font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      {name(p)}
                      {p.isDemo && <ToneChip tone="warning" size="sm" icon={FlaskConical} label={t("demo")} />}
                    </span>
                  </th>
                  <td className="p-3 tabular-nums">{formatMoney(p.pricePaise, locale)}</td>
                  <td className="p-3">{validity(p)}</td>
                  <td className="p-3 tabular-nums">{p.groupSize}</td>
                  <td className="p-3">{p.isActive ? t("yes") : t("no")}</td>
                  <td className="p-3 tabular-nums">{p.soldCount}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={t("editTitle", { name: name(p) })}>
                      {t("edit")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button asChild variant="ghost" className="self-start">
        <Link href="/admin/policies">{admin("policiesTitle")}</Link>
      </Button>
      {editing && <EditDialog key={editing.id} type={editing} name={name(editing)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditDialog({ type, name, onClose }: { type: PassType; name: string; onClose: () => void }) {
  const t = useTranslations("adminApp.passTypes");
  const save = useAdminMutation<PassType>("PATCH", AdminPassTypeDto);
  const [draft, setDraft] = useState<Draft>({
    price: String(type.pricePaise / 100),
    durationDays: String(type.durationDays),
    groupSize: String(type.groupSize),
    sortOrder: String(type.sortOrder),
    isDemo: type.isDemo,
    isActive: type.isActive,
  });
  const [errors, setErrors] = useState<Partial<Record<"price" | "days" | "group", string>>>({});
  const set = (key: keyof Draft) => (value: string | boolean) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(draft.price),
      days = Number(draft.durationDays),
      group = Number(draft.groupSize),
      order = Number(draft.sortOrder);
    const next: typeof errors = {};
    if (!Number.isFinite(price) || price < 0) next.price = t("errors.price");
    if (!Number.isInteger(days) || days < 1 || days > 366) next.days = t("errors.days");
    if (!Number.isInteger(group) || group < 1 || group > 10) next.group = t("errors.group");
    setErrors(next);
    if (Object.keys(next).length) return;
    await save.mutateAsync({
      path: `/admin/pass-types/${type.id}`,
      body: {
        // Money is integer paise (AGENTS.md rule 7)
        pricePaise: Math.round(price * 100),
        durationDays: days,
        groupSize: group,
        sortOrder: Number.isInteger(order) && order >= 0 ? order : type.sortOrder,
        isDemo: draft.isDemo,
        isActive: draft.isActive,
      },
    });
    toast.success(t("saved"));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{t("editTitle", { name })}</DialogTitle>
        <DialogDescription>{t("desc")}</DialogDescription>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          <Field id="pt-price" label={t("priceRupees")} error={errors.price}>
            <Input inputMode="decimal" value={draft.price} onChange={(e) => set("price")(e.target.value)} isError={Boolean(errors.price)} />
          </Field>
          <Field id="pt-days" label={t("durationDays")} error={errors.days}>
            <Input inputMode="numeric" value={draft.durationDays} onChange={(e) => set("durationDays")(e.target.value)} isError={Boolean(errors.days)} />
          </Field>
          <Field id="pt-group" label={t("groupSize")} error={errors.group}>
            <Input inputMode="numeric" value={draft.groupSize} onChange={(e) => set("groupSize")(e.target.value)} isError={Boolean(errors.group)} />
          </Field>
          <Field id="pt-order" label={t("sortOrder")}>
            <Input inputMode="numeric" value={draft.sortOrder} onChange={(e) => set("sortOrder")(e.target.value)} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={draft.isDemo} onCheckedChange={(v) => set("isDemo")(v === true)} />
            <span>{t("demo")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox checked={draft.isActive} onCheckedChange={(v) => set("isActive")(v === true)} />
            <span>{t("active")}</span>
          </label>
          <WriteError error={save.error} />
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
