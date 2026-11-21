import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Consent } from "@/components/consent/consent-cookie";
import type { Locale } from "@/i18n/routing";

/**
 * Choices that must follow the account, not the browser. Read by the app
 * layouts on every page: the language the person is using is written to the
 * account (one conditional update, a no-op when unchanged), and the cookie
 * choice saved on the account is handed to the browser (ConsentSync applies
 * it, the stricter choice winning per category).
 */
export async function syncAccountPrefs(userId: string, locale: Locale) {
  await prisma.user.updateMany({ where: { id: userId, NOT: { locale } }, data: { locale } });
  return { consent: await getAccountConsent(userId) };
}

/**
 * The cookie choice saved on the account, or null when none was made yet.
 * Cached per request: the layout and the Settings page both read it.
 */
export const getAccountConsent = cache(async (userId: string): Promise<Consent | null> => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { consentAnalytics: true, consentMarketing: true, consentAt: true },
  });
  return u?.consentAt && u.consentAnalytics !== null && u.consentMarketing !== null
    ? { analytics: u.consentAnalytics, marketing: u.consentMarketing }
    : null;
});
