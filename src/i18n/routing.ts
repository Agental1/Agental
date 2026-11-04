import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // English is the default (decision log D2, revised 2026-11): the October
  // deck puts Los Angeles first, and English is the language the product is
  // demoed and pitched in. French, Spanish and Chinese are full locales, not
  // fallbacks — every message key must exist in all four (`bun run i18n:check`).
  locales: ["en", "fr", "es", "zh"],
  defaultLocale: "en",
  // Every locale carries its prefix, English included: /en, /fr, /es, /zh.
  //
  // "as-needed" would serve the default locale from unprefixed paths, which
  // makes "/talents" mean different things to different visitors — the
  // middleware redirects it whenever a NEXT_LOCALE cookie says so, so a link
  // shared in a DM opens in another language for anyone who visited it once.
  //
  // Do NOT add matching redirects() to next.config.ts. Next resolves redirects
  // (step 2) before proxy (step 3), so a static /talents -> /en/talents rule
  // preempts locale detection entirely and pins every legacy URL to English.
  // The proxy already handles unprefixed paths, and it negotiates the locale.
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

/**
 * BCP 47 tag for <html lang> and hreflang. The URL segment stays short ("zh");
 * the document says which script it is written in, so screen readers pick a
 * Mandarin voice and the browser picks Simplified Chinese glyphs.
 */
export const LANG_TAG: Record<Locale, string> = {
  en: "en",
  fr: "fr",
  es: "es",
  zh: "zh-Hans",
};
