import { BusFront, CalendarClock, CreditCard, MapPin, Ticket, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { HomeSearch } from "./home-search";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: { absolute: t("common.appName") } };
}

const QUICK_ACTIONS: { href: string; key: "track" | "tickets" | "passes" | "timetable"; icon: LucideIcon }[] = [
  { href: "/track", key: "track", icon: MapPin },
  { href: "/tickets", key: "tickets", icon: Ticket },
  { href: "/passes", key: "passes", icon: CreditCard },
  { href: "/timetable", key: "timetable", icon: CalendarClock },
];

/** docs/11 Citizen "/" and plan sec 6: the question, the search form, four quick actions. */
export default async function HomePage() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <section aria-labelledby="home-title" className="flex flex-col gap-4">
        <h1 id="home-title" className="text-h1 text-fg">
          {t("home.question")}
        </h1>
        <HomeSearch />
      </section>

      <section aria-labelledby="quick-actions-title" className="flex flex-col gap-3">
        <h2 id="quick-actions-title" className="text-h2 text-fg">
          {t("home.quickActions")}
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map(({ href, key, icon: Icon }) => (
            <li key={href} className="min-w-0">
              <Link
                href={href}
                className="flex h-full min-h-28 flex-col justify-between gap-3 rounded-lg border border-default bg-surface-raised p-4 transition-colors duration-fast hover:border-strong hover:bg-surface"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span className="text-body font-medium text-fg">{t(`nav.${key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {/* D-044: bus types and the one ticket rule */}
      <Link
        href="/bus-types"
        className="flex min-h-16 items-center gap-3 rounded-lg border border-default bg-surface-raised p-4 transition-colors duration-fast hover:border-strong hover:bg-surface"
      >
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <BusFront className="size-6" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-body font-medium text-fg">{t("busTypes.title")}</span>
          <span className="text-small text-muted">{t("busTypes.oneTicket.title")}</span>
        </span>
      </Link>
      {/* Updates strip (docs/11): hidden until notifications exist (Day 9). */}
    </div>
  );
}
