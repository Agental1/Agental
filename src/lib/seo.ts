import { routing } from "@/i18n/routing";

/**
 * Canonical origin for every absolute URL the app emits (metadataBase, sitemap,
 * robots, Open Graph). Single source of truth on purpose: the domain used to be
 * inlined in three files as `agental.fr`, which is a parked domain the project
 * does not own — every canonical and hreflang pointed at a third party.
 *
 * Override per environment (Vercel previews must not claim production
 * canonicals) via NEXT_PUBLIC_SITE_URL. Trailing slashes are stripped so
 * `${SITE}${path}` never doubles up.
 */
export const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://agental.co"
).replace(/\/+$/, "");

/**
 * Absolute URL for a locale-prefixed path. `path` is the route WITHOUT a locale
 * segment ("/talents", "/castings/figuration"); "/" yields the locale root.
 *
 * Shared by sitemap.ts and the metadata helpers so the two can never disagree —
 * two URL builders that drift produce hreflang pointing at pages that do not
 * exist, and nothing fails loudly when they do.
 */
export function localeUrl(locale: string, path: string): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return `${SITE}/${locale}${clean}`;
}

/** Every locale's URL for a path, plus x-default on the default locale. */
export function localeAlternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((l) => [l, localeUrl(l, path)])),
    "x-default": localeUrl(routing.defaultLocale, path),
  };
}
