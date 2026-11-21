import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { CASTING_TYPE_SLUGS } from "@/data/casting-types";
import { localeUrl, localeAlternates } from "@/lib/seo";

/**
 * Public, indexable paths, without a locale prefix. Everything behind auth
 * (/talents/app, /casting/app, /admin, /connexion) is deliberately absent and
 * is also disallowed in robots.ts.
 */
const PATHS = [
  "/",
  "/talents",
  "/talents/comment-ca-marche",
  "/talents/tarifs",
  "/talents/faq",
  "/talents/qui-sommes-nous",
  "/talents/confidentialite",
  "/talents/limelight",
  "/casting",
  "/casting/comment-ca-marche",
  "/casting/tarifs",
  "/casting/faq",
  "/castings",
  ...CASTING_TYPE_SLUGS.map((s) => `/castings/${s}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localeUrl(locale, path),
      changeFrequency: "weekly" as const,
      priority: path === "/talents" || path === "/casting" ? 1 : 0.7,
      // URL building is shared with the metadata helpers on purpose: two
      // builders that drift produce hreflang pointing at pages that do not
      // exist, and nothing fails loudly when they do.
      alternates: { languages: localeAlternates(path) },
    }))
  );
}
