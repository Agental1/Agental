import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "es"],
  defaultLocale: "fr",
  // Every locale carries its prefix, French included: /fr, /en, /es.
  //
  // "as-needed" served French from unprefixed paths, which made "/talents" mean
  // different things to different visitors — the middleware redirected it to
  // /en/talents whenever a NEXT_LOCALE cookie said so, so a French link shared
  // in a DM opened in English for anyone who had visited /en once.
  //
  // Do NOT add matching redirects() to next.config.ts. Next resolves redirects
  // (step 2) before proxy (step 3), so a static /talents -> /fr/talents rule
  // preempts locale detection entirely and pins every legacy URL to French.
  // The proxy already handles unprefixed paths, and it negotiates the locale.
  //
  // Spanish is served because the product targets Spanish-speaking talents;
  // audience is segmented per locale so the decision can be revisited on data.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/**
 * Narrow a raw route segment to a Locale.
 *
 * Next's generated PageProps/LayoutProps type `params` as `{ locale: string }`,
 * so route entry points cannot declare the narrower type. [locale]/layout.tsx
 * already calls notFound() on an unknown segment, so by the time a page runs the
 * value is valid — this makes that guarantee visible to the type checker instead
 * of leaving every next-intl call to widen back to string.
 */
export function toLocale(value: string): Locale {
  return (routing.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : routing.defaultLocale;
}
