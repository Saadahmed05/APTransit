import { BUS_CLASSES, coveredClasses, servicesOfClass } from "@aptransit/shared";
import { BusFront, CalendarClock, CircleCheck, MapPin, Route, Ticket, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("busTypes");
  return { title: t("title"), description: t("description") };
}

const BENEFITS = ["easy", "flexible", "convenient", "usage"] as const;

const ACTIONS: { href: string; key: "book" | "track" | "plan"; icon: LucideIcon }[] = [
  { href: "/", key: "book", icon: Ticket },
  { href: "/track", key: "track", icon: MapPin },
  { href: "/timetable", key: "plan", icon: CalendarClock },
];

/**
 * D-044: the owner's "Our bus types and ticket rules" board. Three classes, what a ticket of each
 * covers, and "one ticket for all buses". Public: the rules matter before login too.
 */
export default async function BusTypesPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t("busTypes.title")}</h1>
        <p className="text-body text-muted">{t("busTypes.description")}</p>
      </header>

      <ul className="grid gap-4 md:grid-cols-3">
        {BUS_CLASSES.map((busClass) => (
          <li
            key={busClass}
            aria-labelledby={`class-${busClass}`}
            className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-default bg-surface-raised"
          >
            <div className="flex items-center gap-3 bg-primary-soft p-4 text-primary">
              <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                {coveredClasses(busClass).map((covered) => (
                  <BusFront key={covered} className="size-6" />
                ))}
              </span>
              <h2 id={`class-${busClass}`} className="text-h3">
                {t(`busClass.${busClass}`)}
              </h2>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <p className="flex items-start gap-2 text-body font-medium text-fg">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                {t(`busTypes.classes.${busClass}.rule`)}
              </p>
              <p className="flex items-start gap-2 text-body text-muted">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                {t(`busTypes.classes.${busClass}.note`)}
              </p>
              <div className="mt-auto border-t border-default pt-3">
                <p className="text-caption text-subtle">{t("busTypes.servicesLabel")}</p>
                <p className="text-small text-fg">
                  {servicesOfClass(busClass)
                    .map((service) => t(`serviceType.${service}`))
                    .join(", ")}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="one-ticket-title"
        className="flex flex-col gap-4 rounded-lg border border-default bg-surface-raised p-5"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Route className="size-6" aria-hidden="true" />
          </span>
          <h2 id="one-ticket-title" className="text-h2 text-fg">
            {t("busTypes.oneTicket.title")}
          </h2>
        </div>
        <p className="text-body font-medium text-fg">{t("busTypes.oneTicket.lead")}</p>
        <p className="text-body text-muted">{t("busTypes.oneTicket.how")}</p>
        <h3 className="text-h3 text-fg">{t("busTypes.oneTicket.benefitsTitle")}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {BENEFITS.map((key) => (
            <li key={key} className="flex items-start gap-2 text-body text-fg">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              {t(`busTypes.oneTicket.benefits.${key}`)}
            </li>
          ))}
        </ul>
      </section>

      <nav aria-labelledby="bus-types-actions" className="flex flex-col gap-3">
        <h2 id="bus-types-actions" className="sr-only">
          {t("busTypes.actions.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {ACTIONS.map(({ href, key, icon: Icon }) => (
            <li key={key} className="min-w-0">
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-default bg-surface-raised p-4 text-body font-medium text-fg transition-colors duration-fast hover:border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
                {t(`busTypes.actions.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
