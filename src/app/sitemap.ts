import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { CASTING_TYPE_SLUGS } from "@/data/casting-types";

const BASE = "https://agental.fr";

const PATHS = [
  "/talents",
  "/talents/comment-ca-marche",
  "/talents/tarifs",
  "/talents/faq",
  "/talents/qui-sommes-nous",
  "/casting",
  "/casting/comment-ca-marche",
  "/casting/tarifs",
  "/casting/faq",
  "/castings",
  ...CASTING_TYPE_SLUGS.map((s) => `/castings/${s}`),
];

/** Build a locale-prefixed URL (default locale has no prefix — localePrefix "as-needed"). */
function url(locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${BASE}${prefix}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: url(locale, path),
      changeFrequency: "weekly" as const,
      priority: path === "/talents" || path === "/casting" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, url(l, path)])
        ),
      },
    }))
  );
}
