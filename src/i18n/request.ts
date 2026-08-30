import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode, type IntlError } from "next-intl";
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

    /**
     * A missing key is a content bug, not a crash. Log it with enough context to
     * find it (which locale, which key) and keep the page rendering.
     * MISSING_MESSAGE is expected while a locale is being filled in; anything
     * else is a real formatting fault and deserves a louder line.
     */
    onError(error: IntlError) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        console.warn(`[i18n] missing message (${locale}): ${error.message}`);
        return;
      }
      console.error(`[i18n] ${error.code} (${locale}):`, error.message);
    },

    /**
     * Never render a raw key path to a visitor. next-intl's default fallback is
     * `${namespace}.${key}`, so an unfilled Spanish key would show
     * "talents.dashboard.title" on the page. In production we degrade to the
     * last key segment, which reads as clumsy English rather than as a leaked
     * internal identifier; in development we keep the full path so the
     * developer can find it instantly.
     */
    getMessageFallback({ namespace, key }) {
      const path = [namespace, key].filter(Boolean).join(".");
      if (process.env.NODE_ENV === "development") return `⟨${path}⟩`;
      return key.split(".").pop() ?? key;
    },
  };
});
