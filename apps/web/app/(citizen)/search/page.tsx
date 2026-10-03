import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SearchClient } from "./search-client";

interface SearchPageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    date?: string;
    after?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("search.title"),
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const t = await getTranslations();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="sr-only">{t("search.title")}</h1>
      <SearchClient
        initialFromId={params.from}
        initialToId={params.to}
        initialDate={params.date}
        initialAfter={params.after}
      />
    </div>
  );
}
