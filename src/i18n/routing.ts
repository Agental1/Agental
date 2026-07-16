import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // French is V1; the default locale is served without a prefix (/…),
  // English lives under /en/…. Architecture stays ready for more locales.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
