import type { Metadata } from "next";
import { Inter, Noto_Sans_Telugu } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BusSplash } from "../components/bus-splash";
import { Providers } from "../components/providers";
import "./globals.css";

// Fonts are self hosted by Next at build time (no runtime Google calls). docs/09, Typography.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const notoSansTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  display: "swap",
  variable: "--font-telugu",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    title: { default: t("appName"), template: `%s · ${t("appName")}` },
    description: t("appDescription"),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value;
  const dataTheme = theme === "dark" || theme === "light" ? theme : undefined;
  // D-016: httpOnly marker without a secret. Tells the client a silent refresh is worth trying.
  const hasSession = cookieStore.has("apt_session");

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-locale={locale}
      data-theme={dataTheme}
      className={`${inter.variable} ${notoSansTelugu.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <BusSplash />
          <Providers hasSession={hasSession}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
