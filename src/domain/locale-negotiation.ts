import { routing, type Locale } from "@/i18n/routing";

/**
 * Round 11: the language of a first visit, in this order.
 *   1. The language chosen before (the NEXT_LOCALE cookie, written whenever a
 *      page is shown in a language, so a choice in Settings or the switcher
 *      always wins). Signed-in people also land in their account's language
 *      after sign-in (/continuer).
 *   2. The browser or phone language (Accept-Language), first supported one
 *      by preference.
 *   3. The country of the IP address (Vercel's x-vercel-ip-country), when no
 *      browser language is supported.
 *   4. English.
 * Pure: the proxy reads the headers and passes them in.
 */

const SUPPORTED = new Set<string>(routing.locales);

function isLocale(v: string | null | undefined): v is Locale {
  return !!v && SUPPORTED.has(v);
}

/** The first supported language in an Accept-Language header, by weight. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((t) => t.tag && t.tag !== "*" && t.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const { tag } of tags) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** Countries whose main language is one of ours (ISO 3166-1 alpha-2). */
const COUNTRY_LOCALE: Record<string, Locale> = {
  // Italian
  IT: "it", SM: "it", VA: "it",
  // Portuguese
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt", CV: "pt", GW: "pt", ST: "pt", TL: "pt",
  // Japanese, Korean
  JP: "ja", KR: "ko",
  // Chinese
  CN: "zh", TW: "zh", HK: "zh", MO: "zh",
  // French (Belgium, Switzerland and Canada have several languages: their
  // browsers almost always say which; the country is only a fallback)
  FR: "fr", BE: "fr", LU: "fr", MC: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr", NE: "fr", TG: "fr", BJ: "fr", GA: "fr", CG: "fr", CD: "fr", CM: "fr", MG: "fr", HT: "fr",
  // Spanish
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es", GQ: "es",
};

export function fromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return COUNTRY_LOCALE[country.trim().toUpperCase()] ?? null;
}

export function pickLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return fromAcceptLanguage(input.acceptLanguage) ?? fromCountry(input.country) ?? routing.defaultLocale;
}
