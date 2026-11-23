import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Round 9, group 6: the one-click unsubscribe link of each automatic email.
 * A link names one account and one category and is signed with AUTH_SECRET,
 * so nobody can turn off someone else's emails by guessing. It never expires:
 * an old email must still unsubscribe.
 *
 *   roles_found        -> User.notifyRolesFound = false
 *   application_update -> User.notifyApplications = false
 *   message_reply      -> User.notifyMessages = false
 *   welcome            -> User.notifyProduct = false (tips and news; the welcome is sent once)
 *
 * Account emails (verification, password reset, codes) have no unsubscribe:
 * they always go out.
 */
export const EMAIL_CATEGORIES = ["roles_found", "application_update", "message_reply", "welcome"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const CATEGORY_FIELD = {
  roles_found: "notifyRolesFound",
  application_update: "notifyApplications",
  message_reply: "notifyMessages",
  welcome: "notifyProduct",
} as const satisfies Record<EmailCategory, string>;

export function isEmailCategory(v: unknown): v is EmailCategory {
  return typeof v === "string" && (EMAIL_CATEGORIES as readonly string[]).includes(v);
}

function secret(env: Record<string, string | undefined>): string {
  const s = (env.AUTH_SECRET ?? "").trim();
  if (s.length < 16) throw new Error("AUTH_SECRET is missing: unsubscribe links cannot be signed.");
  return s;
}

export function unsubscribeToken(userId: string, category: EmailCategory, env: Record<string, string | undefined> = process.env): string {
  return createHmac("sha256", secret(env)).update(`unsubscribe:${userId}:${category}`).digest("base64url").slice(0, 32);
}

export function unsubscribeTokenValid(
  userId: string,
  category: string,
  token: string,
  env: Record<string, string | undefined> = process.env
): category is EmailCategory {
  if (!isEmailCategory(category) || !/^[A-Za-z0-9_-]{32}$/.test(token) || !/^[a-z0-9]{10,40}$/i.test(userId)) return false;
  const expected = Buffer.from(unsubscribeToken(userId, category, env));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The page a person lands on, and the one-click POST target (RFC 8058). */
export function unsubscribeUrls(base: string, locale: string, userId: string, category: EmailCategory) {
  const q = new URLSearchParams({ u: userId, c: category, t: unsubscribeToken(userId, category) }).toString();
  return {
    page: `${base}/${locale}/desabonnement?${q}`,
    oneClick: `${base}/api/email/unsubscribe?${q}`,
  };
}

/**
 * Turn the category off for that account, if the link is genuine. Never
 * throws; true when the link was valid (also when it was already off).
 */
export async function applyUnsubscribe(userId: string, category: string, token: string): Promise<boolean> {
  try {
    if (!unsubscribeTokenValid(userId, category, token)) return false;
  } catch {
    return false;
  }
  const { prisma } = await import("@/lib/db");
  const { audit } = await import("@/lib/audit");
  const field = CATEGORY_FIELD[category];
  const res = await prisma.user.updateMany({ where: { id: userId, [field]: true }, data: { [field]: false } });
  if (res.count === 1) {
    await audit({ actorUserId: userId, action: "email.unsubscribe", resourceType: "User", resourceId: userId, after: { category } });
  }
  return true;
}
