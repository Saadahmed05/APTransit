"use client";

import { Button, ErrorState } from "@aptransit/ui";
import { Home } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations();

  return (
    <main id="main-content" className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-4">
      <ErrorState
        headingLevel="h1"
        title={t("error.title")}
        message={t("error.description")}
        retryLabel={t("common.retry")}
        onRetry={reset}
        requestId={error.digest}
      />
      <Button asChild variant="ghost" size="md">
        <Link href="/">
          <Home className="size-4" aria-hidden="true" />
          {t("common.goHome")}
        </Link>
      </Button>
    </main>
  );
}
