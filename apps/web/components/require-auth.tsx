"use client";

import { can, type Permission } from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@aptransit/ui";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { errorKey } from "../lib/api";
import { roleHome, rolesOf } from "../lib/roles";
import { useAuth, useMe } from "./auth-provider";

function PageSkeleton() {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </div>
  );
}

/** Shows children only to a logged in user. Anonymous visitors go to /login?next=<this page>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, loggingOut, retry } = useAuth();
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    if (status !== "anonymous" || loggingOut) return;
    // Read from location, not useSearchParams, so static pages need no Suspense boundary.
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [status, loggingOut, router]);

  if (status === "authenticated") return <>{children}</>;
  if (status === "error") {
    return <ErrorState message={t("errors.NETWORK")} retryLabel={t("common.retry")} onRetry={retry} />;
  }
  return <PageSkeleton />;
}

export interface RequirePermissionProps {
  /** Any one of these is enough (admin needs network:write or policy:write or user:roles). */
  anyOf: readonly Permission[];
  children: ReactNode;
}

/** docs/08: staff surfaces check can(user, permission) after useMe and show a 403 state if not allowed. */
export function RequirePermission({ anyOf, children }: RequirePermissionProps) {
  return (
    <RequireAuth>
      <PermissionGate anyOf={anyOf}>{children}</PermissionGate>
    </RequireAuth>
  );
}

function PermissionGate({ anyOf, children }: RequirePermissionProps) {
  const t = useTranslations();
  const me = useMe();

  if (me.isPending) return <PageSkeleton />;
  if (me.isError) {
    return (
      <ErrorState
        message={t(errorKey(me.error, (k) => t.has(k)))}
        retryLabel={t("common.retry")}
        onRetry={() => void me.refetch()}
      />
    );
  }

  const roles = rolesOf(me.data);
  if (anyOf.some((permission) => can(roles, permission))) return <>{children}</>;

  return (
    <EmptyState
      headingLevel="h1"
      icon={ShieldAlert}
      title={t("auth.forbidden.title")}
      hint={t("auth.forbidden.hint")}
      action={
        <Button asChild variant="secondary">
          <Link href={roleHome(me.data)}>{t("auth.forbidden.home")}</Link>
        </Button>
      }
    />
  );
}
