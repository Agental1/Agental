import { prisma } from "@/lib/db";
import type { Locale } from "@/i18n/routing";

/**
 * Choices that must follow the account, not the browser. Read by the app
 * layouts on every page: the language the person is using is written to the
 * account (one conditional update, a no-op when unchanged), and the cookie
 * choice saved on the account is handed to the browser.
 */
export async function syncAccountPrefs(userId: string, locale: Locale) {
  await prisma.user.updateMany({ where: { id: userId, NOT: { locale } }, data: { locale } });
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { consentAnalytics: true, consentMarketing: true, consentAt: true },
  });
  const consent =
    u?.consentAt && u.consentAnalytics !== null && u.consentMarketing !== null
      ? { analytics: u.consentAnalytics, marketing: u.consentMarketing }
      : null;
  return { consent };
}
