import { Button, EmptyState } from "@aptransit/ui";
import { FileQuestion, Home } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export default function NotFound() {
  const t = useTranslations();

  return (
    <main id="main-content" className="flex min-h-[70vh] items-center justify-center p-4">
      <EmptyState
        headingLevel="h1"
        icon={FileQuestion}
        title={t("notFound.title")}
        hint={t("notFound.description")}
        action={
          <Button asChild variant="primary" size="md">
            <Link href="/">
              <Home className="size-4" aria-hidden="true" />
              {t("common.goHome")}
            </Link>
          </Button>
        }
      />
    </main>
  );
}
