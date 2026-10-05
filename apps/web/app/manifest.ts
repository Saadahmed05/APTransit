import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { lightToken } from "../lib/token-values";

/** Day 10 PWA manifest (docs/04: app/manifest.ts plus a hand written public/sw.js). English, lang en. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: "en", namespace: "common" });
  return {
    name: t("appName"),
    short_name: t("appShortName"),
    description: t("appDescription"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    background_color: lightToken("bg"),
    theme_color: lightToken("primary"),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
