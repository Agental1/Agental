import { z } from "zod";

/**
 * When an account must confirm its email address before going further.
 *
 * Sign-up with a password has never proven the address. The gate is opened by
 * the founders from a date, EMAIL_VERIFICATION_REQUIRED_SINCE, so accounts
 * created before that date keep working exactly as they did. It also stays
 * closed while the deployment has no way to send email: asking for a
 * confirmation nobody can receive would lock people out.
 *
 * Pure: the caller reads the environment and the user row and passes them in.
 */

export interface EmailVerificationUser {
  emailVerified: Date | null;
  passwordHash: string | null;
  createdAt: Date;
}

export interface EmailVerificationOptions {
  /** emailSenderConfigured() from src/lib/mailer.ts. */
  senderConfigured: boolean;
  /** parseRequiredSince(process.env.EMAIL_VERIFICATION_REQUIRED_SINCE). */
  requiredSince: Date | null;
}

/**
 * True only when all of these hold: email can be sent, the gate has a start
 * date, the account signs in with a password, its address is unconfirmed, and
 * it was created at or after the start date.
 *
 * An account with no password came in through Google or Apple, which
 * confirmed the address themselves.
 */
export function requiresEmailVerification(
  user: EmailVerificationUser,
  opts: EmailVerificationOptions
): boolean {
  if (!opts.senderConfigured || !opts.requiredSince) return false;
  if (!user.passwordHash || user.emailVerified) return false;
  return user.createdAt.getTime() >= opts.requiredSince.getTime();
}

/**
 * An account that keeps working but has not confirmed its address: a
 * password account, unconfirmed, that the gate does not hold (created before
 * the start date). It sees a "Verify your email" banner, never a lock. Shown
 * only while email can be sent, so the resend button does something.
 */
export function showsVerifyBanner(
  user: EmailVerificationUser,
  opts: EmailVerificationOptions
): boolean {
  if (!opts.senderConfigured) return false;
  if (!user.passwordHash || user.emailVerified) return false;
  return !requiresEmailVerification(user, opts);
}

// A full ISO 8601 instant with its zone, or a calendar day.
const RequiredSince = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

/**
 * Read EMAIL_VERIFICATION_REQUIRED_SINCE. A calendar day ("2026-12-01") means
 * the first instant of that day, UTC. An instant needs its zone ("Z" or an
 * offset). Anything else, empty included, is null: the gate stays closed.
 */
export function parseRequiredSince(raw: string | undefined): Date | null {
  if (typeof raw !== "string") return null;
  const parsed = RequiredSince.safeParse(raw.trim());
  if (!parsed.success) return null;
  const date = new Date(parsed.data);
  return Number.isNaN(date.getTime()) ? null : date;
}
