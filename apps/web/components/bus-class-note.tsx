import { busClassOf, type ServiceType } from "@aptransit/shared";
import { BusFront } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * D-044: "Express ticket. Can travel in Express and Normal buses." for a trip or a ticket of this
 * service, with a link to the rules. Works in server and client components.
 */
export function BusClassNote({ serviceType }: { serviceType: ServiceType }) {
  const t = useTranslations();
  const busClass = busClassOf(serviceType);
  return (
    <div className="flex items-start gap-3 rounded-md border border-default bg-surface p-3">
      <BusFront className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold text-fg">
          {t("busTypes.ticketOf", { class: t(`busClass.${busClass}`) })}
        </p>
        <p className="text-small text-muted">{t(`busTypes.classes.${busClass}.rule`)}</p>
        <Link
          href="/bus-types"
          className="inline-flex min-h-11 items-center text-small font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("busTypes.learnMore")}
        </Link>
      </div>
    </div>
  );
}
