/**
 * When an account must confirm its email address before reaching the app.
 *
 * Round 11 (founder): one switch in Admin > Controls, "Email verification
 * required before the dashboard", off by default. While it is on, an email and
 * password account whose address is unconfirmed is sent to the 6-digit code
 * screen from every app page, after sign-up and at every sign-in, until it
 * enters the code. Google and Apple accounts pass: the provider confirmed the
 * address. It also stays open while the deployment cannot send email: asking
 * for a code nobody can receive would lock people out.
 *
 * Replaces the round 5 start date (EMAIL_VERIFICATION_REQUIRED_SINCE), which
 * switched itself on as soon as a Resend key existed. That variable is no
 * longer read.
 *
 * Pure: the caller reads the switch, the sender and the user row.
 */

export interface EmailVerificationUser {
  emailVerified: Date | null;
  passwordHash: string | null;
}

export interface EmailVerificationOptions {
  /** emailVerificationRequired() from src/lib/app-settings.ts (Admin > Controls). */
  gateOn: boolean;
  /** emailCodeAvailable() from src/lib/email-code.ts: a code can reach people. */
  senderConfigured: boolean;
}

/** True only when the switch is on, a code can be sent, and the password account is unconfirmed. */
export function requiresEmailVerification(user: EmailVerificationUser, opts: EmailVerificationOptions): boolean {
  if (!opts.gateOn || !opts.senderConfigured) return false;
  return !!user.passwordHash && !user.emailVerified;
}
