"use client";

import { formatDate, formatTime, maskEmail, maskPhone, normalizeRecipient, TicketDto, TransferTicketResult } from "@aptransit/shared";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
  toast,
} from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Gift, Mail, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { api, errorKey, isApiError } from "../../../../../lib/api";
import { queryKeys } from "../../../../../lib/query-keys";

export function GiftView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [showError, setShowError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // One key per gift attempt, so a retried request cannot gift twice
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const ticketQuery = useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: ({ signal }) => api(`/tickets/${id}`, { schema: TicketDto, signal }),
  });

  const recipient = normalizeRecipient(value);
  const masked = recipient ? (recipient.channel === "EMAIL" ? maskEmail(recipient.value) : maskPhone(recipient.value)) : "";

  const gift = useMutation({
    mutationFn: () =>
      api(`/tickets/${id}/transfer`, {
        method: "POST",
        body: { recipient: value },
        headers: { "Idempotency-Key": idempotencyKey },
        schema: TransferTicketResult,
      }),
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: queryKeys.ticket(id) });
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(t("gift.done", { recipient: result.recipientMasked }));
      router.replace("/tickets");
    },
    onError: () => setIdempotencyKey(crypto.randomUUID()),
  });

  const back = (
    <Button asChild variant="ghost">
      <Link href={`/tickets/${id}`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("gift.back")}
      </Link>
    </Button>
  );

  if (ticketQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const ticket = ticketQuery.data;
  if (ticketQuery.isError || !ticket) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("ticketDetail.errorTitle")}
        message={t(errorKey(ticketQuery.error, (k) => t.has(k)))}
        requestId={isApiError(ticketQuery.error) ? ticketQuery.error.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => void ticketQuery.refetch()}
      />
    );
  }

  if (!ticket.canGift) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        {back}
        <EmptyState headingLevel="h1" icon={Gift} title={t("gift.notGiftableTitle")} hint={t("gift.notGiftableHint")} className="w-full" />
      </div>
    );
  }

  const cutoff = ticket.giftCutoffAt;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!recipient) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    gift.reset();
    setConfirmOpen(true);
  };

  const fieldError = showError && !recipient ? t("gift.invalid") : undefined;
  const serverError = gift.error ? t(errorKey(gift.error, (k) => t.has(k))) : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>{back}</div>
      <h1 className="text-h1 text-fg">{t("gift.title")}</h1>
      <p className="text-body text-muted">{t("gift.intro")}</p>

      <Card padding="md" className="flex flex-col gap-4">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field id="gift-recipient" label={t("gift.recipientLabel")} hint={t("gift.recipientHint")} error={fieldError} required>
            <Input
              ref={inputRef}
              id="gift-recipient"
              inputMode={value.includes("@") || /[a-z]/i.test(value) ? "email" : "tel"}
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={fieldError ? true : undefined}
            />
          </Field>
          {recipient && (
            <p className="flex items-center gap-2 text-small text-muted" aria-live="polite">
              {recipient.channel === "EMAIL" ? <Mail className="size-4" aria-hidden="true" /> : <Phone className="size-4" aria-hidden="true" />}
              {recipient.channel === "EMAIL" ? t("gift.detectedEmail") : t("gift.detectedPhone")}
            </p>
          )}
          <p className="text-small text-muted">{t("gift.rules", { time: `${formatDate(cutoff, locale)}, ${formatTime(cutoff, locale)}` })}</p>
          {serverError && (
            <p role="alert" className="text-small text-status-danger">
              {serverError}
            </p>
          )}
          <Button type="submit" size="lg" loading={gift.isPending}>
            {t("gift.continue")}
          </Button>
        </form>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("gift.confirmTitle", { seat: ticket.seatNo ?? "", recipient: masked })}</DialogTitle>
            <DialogDescription>{t("gift.confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t("gift.keep")}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                gift.mutate();
              }}
            >
              {t("gift.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
