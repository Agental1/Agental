import { defineRouting } from "next-intl/routing";

/**
 * English only (decided 2026-10-12, see decision log D2).
 *
 * next-intl stays in place with a single locale so a language can be added
 * later without rewriting every page. `localePrefix: "never"` keeps URLs clean
 * (`/talents`, not `/en/talents`): the proxy rewrites them onto the internal
 * `[locale]` segment.
 *
 * Do NOT add matching redirects() to next.config.ts. Next resolves redirects
 * (step 2) before proxy (step 3), so static rules would preempt the rewrite.
 */
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "never",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/**
 * Narrow a raw route segment to a Locale.
 *
 * Next's generated PageProps/LayoutProps type `params` as `{ locale: string }`,
 * so route entry points cannot declare the narrower type. [locale]/layout.tsx
 * already calls notFound() on an unknown segment, so by the time a page runs the
 * value is valid — this makes that guarantee visible to the type checker.
 */
export function toLocale(value: string): Locale {
  return (routing.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : routing.defaultLocale;
}
