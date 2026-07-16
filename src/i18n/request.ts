import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Per-request i18n config. Messages are split into voice namespaces so the same
 * key reads with the correct register per portal (tu for Talents, vous for
 * Casting) — see messages/<locale>/*.json.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const [common, talents, casting] = await Promise.all([
    import(`../../messages/${locale}/common.json`),
    import(`../../messages/${locale}/talents.json`),
    import(`../../messages/${locale}/casting.json`),
  ]);

  return {
    locale,
    messages: {
      common: common.default,
      talents: talents.default,
      casting: casting.default,
    },
  };
});
