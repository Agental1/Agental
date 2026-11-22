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
  const record = await getAccountConsentRecord(userId);
  return {
    consent: record ? { analytics: record.analytics, marketing: record.marketing } : null,
    consentAt: record?.at ?? null,
    consentVersion: record?.version ?? null,
  };
}

/**
 * The cookie choice saved on the account, or null when none was made yet.
 * Cached per request: the layout and the Settings page both read it.
 */
export const getAccountConsentRecord = cache(
  async (userId: string): Promise<(Consent & { at: string; version: string | null }) | null> => {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { consentAnalytics: true, consentMarketing: true, consentAt: true, consentVersion: true },
    });
    return u?.consentAt && u.consentAnalytics !== null && u.consentMarketing !== null
      ? {
          analytics: u.consentAnalytics,
          marketing: u.consentMarketing,
          at: u.consentAt.toISOString(),
          version: u.consentVersion,
        }
      : null;
  }
);

export async function getAccountConsent(userId: string): Promise<Consent | null> {
  const r = await getAccountConsentRecord(userId);
  return r ? { analytics: r.analytics, marketing: r.marketing } : null;
}
