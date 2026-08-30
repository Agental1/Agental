import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Fraunces, Inter } from "next/font/google";
import { routing, toLocale } from "@/i18n/routing";
import { SITE, jsonLd, localeAlternates, organizationLd } from "@/lib/seo";
import { Analytics } from "@/components/analytics";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
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
  const locale = toLocale(rawLocale);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${fraunces.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* Organization node, emitted once for the whole site. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationLd(locale)) }}
        />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
