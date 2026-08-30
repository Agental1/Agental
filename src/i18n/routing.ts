import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // French is V1; the default locale is served without a prefix (/…),
  // English lives under /en/…. Architecture stays ready for more locales.
  localePrefix: "as-needed",
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
