import { createHmac, hkdfSync } from "node:crypto";

/**
 * Keyed hashes for rate-limit keys, so the RateLimitEvent table holds neither
 * an email address nor an IP, and a dump of it alone cannot be reversed by
 * trying every IPv4 address. Each family derives its own key from AUTH_SECRET.
 *
 * Round 11 (r111): one place for both families, so deleting an account can
 * clear every counter keyed on its email (src/lib/admin/account-removal.ts).
 */
function keyedHash(value: string, salt: string, info: string): string {
  const key = hkdfSync("sha256", process.env.AUTH_SECRET ?? "", salt, info, 32);
  return createHmac("sha256", new Uint8Array(key)).update(value).digest("hex");
}

/** Sign-up and sign-in keys (src/lib/abuse.ts). */
export const abuseKeyHash = (value: string) => keyedHash(value, "agental:abuse", "rate-limit-key");

/** Password reset keys (src/app/actions/account-email.ts). */
export const accountEmailKeyHash = (value: string) => keyedHash(value, "agental.account-email.v1", "agental:rate-limit-key");

/** Every rate-limit key built from this email address. */
export function emailRateLimitKeys(email: string): string[] {
  const address = email.trim().toLowerCase();
  const h = abuseKeyHash(address);
  return [
    `signup:email:${h}`,
    `signup-taken:email:${h}`,
    `signin:email:${h}`,
    `signinCallback:email:${h}`,
    `pw-reset:email:${accountEmailKeyHash(address)}`,
  ];
}

/** Every rate-limit key built from this account id (codes and email changes). */
export function userRateLimitKeys(userId: string): string[] {
  return [
    `email-code-send:${userId}`,
    `email-code:${userId}`,
    `email-change:${userId}`,
    `email-verify:minute:${userId}`,
    `email-verify:hour:${userId}`,
  ];
}
