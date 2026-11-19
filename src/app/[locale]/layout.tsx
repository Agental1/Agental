import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import { routing, toLocale, LANG_TAG } from "@/i18n/routing";
import { SITE, jsonLd, localeAlternates, organizationLd } from "@/lib/seo";
import { Analytics } from "@/components/analytics";
import { DemoMode } from "@/components/demo/demo-mode";
import "../globals.css";

/**
 * Geist Sans carries everything, display included; Geist Mono only for figures
 * that must line up (prices, scores, percentages). Self-hosted through the
 * `geist` package rather than next/font/google: no build-time call to Google,
 * and no third-party font request from the visitor's browser.
 */
/**
 * Talents typefaces (2026-11): Instrument Sans for reading, Big Shoulders
 * Display for headlines, a condensed marquee face from the billing block of a
 * film poster. Self-hosted from the Fontsource builds in src/assets/fonts (OFL),
 * so the no-Google rule above still holds. Only the Talents skin uses them.
 */
const instrument = localFont({
  // The Latin subset covers English, French and Spanish (é, ñ, œ included).
  src: "../../assets/fonts/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-instrument",
  display: "swap",
});
const marquee = localFont({
  src: "../../assets/fonts/big-shoulders-display-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-marquee",
  display: "swap",
});

/**
 * Site-wide metadata, per locale.
 *
 * This was a static `export const metadata` with French copy, which meant every
 * /en and /es page inherited a French title template and a French description —
 * the single largest metadata defect on the site, and one a static export
 * cannot fix: it has no access to params, so it cannot know the locale.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "common" });

  return {
    metadataBase: new URL(SITE),
    title: { default: t("meta.title"), template: t("meta.template") },
    description: t("meta.description"),
    alternates: { languages: localeAlternates("/") },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  // hasLocale narrows on the RAW segment. Coercing with toLocale() first made
  // this guard dead code — an unknown segment became the default locale, so the
  // condition was never true and notFound() could not fire. The proxy happens
  // to redirect unknown prefixes today, but that is a second line of defence,
  // and this one has to actually defend.
  if (!hasLocale(routing.locales, rawLocale)) notFound();
  const locale = rawLocale;
  setRequestLocale(locale);

  return (
    <html
      lang={LANG_TAG[locale]}
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrument.variable} ${marquee.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* Organization node, emitted once for the whole site. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationLd(locale)) }}
        />
        <NextIntlClientProvider>
          {children}
          {/* `?demo`: scripted tour for screen recording. Inert otherwise. */}
          <DemoMode />
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
