import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { routing, toLocale } from "@/i18n/routing";
import { SITE, jsonLd, localeAlternates, organizationLd } from "@/lib/seo";
import { Analytics } from "@/components/analytics";
import { DemoMode } from "@/components/demo/demo-mode";
import "../globals.css";

/**
 * Instrument Sans carries everything, headings included — the mockups have no
 * serif. `axes` is deliberately absent: Instrument Sans exposes a `wdth` axis
 * we never vary, and requesting it ships a larger file for nothing.
 *
 * latin-ext is not optional: it carries the accented glyphs the French and
 * Spanish copy is full of.
 */
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Eyebrows, step numerals, prices, scores — every uppercase-tracked or
 *  numeric run in the mockups is monospaced. */
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "latin-ext"],
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
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${instrument.variable} ${jetbrains.variable} h-full`}
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
