"use client";

import { CancelTicketResult, formatMoney, RefundQuoteDto } from "@aptransit/shared";
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
  Skeleton,
  toast,
} from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorKey, isApiError } from "../../../../../lib/api";
import { queryKeys } from "../../../../../lib/query-keys";

export function CancelView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const quoteQuery = useQuery({
    queryKey: queryKeys.refundQuote(id),
    queryFn: ({ signal }) => api(`/tickets/${id}/refund-quote`, { schema: RefundQuoteDto, signal }),
  });

  const cancel = useMutation({
    mutationFn: () => api(`/tickets/${id}/cancel`, { method: "POST", schema: CancelTicketResult }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.ticket(id), result.ticket);
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(t("ticketCancel.done"));
      router.replace(`/tickets/${id}`);
    },
  });

  const back = (
    <Button asChild variant="ghost">
      <Link href={`/tickets/${id}`}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("ticketCancel.back")}
      </Link>
    </Button>
  );

  if (quoteQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("common.loading")}
        </span>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (quoteQuery.isError || !quoteQuery.data) {
    return (
      <ErrorState
        headingLevel="h1"
        title={t("ticketCancel.errorTitle")}
        message={t(errorKey(quoteQuery.error, (k) => t.has(k)))}
        requestId={isApiError(quoteQuery.error) ? quoteQuery.error.requestId : undefined}
        retryLabel={t("common.retry")}
        onRetry={() => void quoteQuery.refetch()}
      />
    );
  }

  const quote = quoteQuery.data;
  if (!quote.cancellable) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        {back}
        <EmptyState headingLevel="h1" icon={Ban} title={t("ticketCancel.notCancellableTitle")} hint={t("ticketCancel.notCancellableHint")} className="w-full" />
      </div>
    );
  }

  const amount = formatMoney(quote.amountPaise, locale);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div>{back}</div>
      <h1 className="text-h1 text-fg">{t("ticketCancel.title")}</h1>
      <Card padding="md" className="flex flex-col gap-2">
        <p className="text-h2 text-fg">{t("ticketCancel.youGet", { amount })}</p>
        <p className="text-small text-muted">
          {t("ticketCancel.policy", { percent: quote.percent, policy: quote.policyName, fee: formatMoney(quote.feePaise, locale) })}
        </p>
      </Card>

      {cancel.error && (
        <p role="alert" className="text-small text-status-danger">
          {t(errorKey(cancel.error, (k) => t.has(k)))}
        </p>
      )}

      <Button variant="danger" size="lg" loading={cancel.isPending} onClick={() => setConfirmOpen(true)}>
        {t("ticketCancel.confirm")}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("ticketCancel.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("ticketCancel.confirmBody", { amount })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t("ticketCancel.keep")}
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                setConfirmOpen(false);
                cancel.mutate();
              }}
            >
              {t("ticketCancel.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
