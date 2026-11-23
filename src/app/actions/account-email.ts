"use server";

import { createHmac, hkdfSync } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/auth";
import { err, zodError, type ActionError } from "@/domain/action-result";
import { NewPassword } from "@/domain/auth";
import { toLocale } from "@/i18n/routing";
import { audit } from "@/lib/audit";
import { findUsersByEmail } from "@/lib/auth/user-by-email";
import { normalizeEmail } from "@/lib/auth/oauth-identity";
import { prisma } from "@/lib/db";
import { passwordResetEmail, verificationEmail } from "@/lib/email-templates";
import {
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  consumeEmailToken,
  createEmailToken,
  linkFor,
  revokeEmailTokens,
  siteBaseUrl,
  type HeaderReader,
} from "@/lib/email-tokens";
import {
  emailSenderConfigured,
  sendEmail,
  type SendEmailResult,
} from "@/lib/mailer";
import { hitRateLimit } from "@/lib/rate-limit";
import { captchaPassed } from "@/lib/abuse";

/**
 * Email verification and password reset.
 *
 * Both run on single-use links (src/lib/email-tokens.ts) sent through
 * src/lib/mailer.ts. The pages behind the links are /[locale]/verifier and
 * /[locale]/reinitialiser; they hand the `token` query value to verifyEmail
 * and resetPassword. Call those two from a button press, since mail scanners
 * open every link they see and a token works once.
 *
 * Every export of a "use server" file can be reached by a direct POST with
 * arguments of the caller's choosing, the helper at the bottom included. Each
 * one therefore checks what it is given and reads the rest from the database.
 */

export type EmailActionResult =
  | { ok: true }
  | { ok: false; error: ActionError };

export type RequestEmailVerificationResult =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; error: ActionError };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** A confirmation email: one per minute and five per hour, per user. */
const VERIFY_PER_MINUTE = { limit: 1, windowMs: MINUTE_MS };
const VERIFY_PER_HOUR = { limit: 5, windowMs: HOUR_MS };

/** Reset requests: three per hour per address, ten per hour per IP. */
const RESET_PER_EMAIL = { limit: 3, windowMs: HOUR_MS };
const RESET_PER_IP = { limit: 10, windowMs: HOUR_MS };

/** How young an account must be for sendVerificationForNewUser to serve it. */
const NEW_USER_WINDOW_MS = 10 * MINUTE_MS;

const BCRYPT_COST = 10;

const RATE_KEY_SALT = "agental.account-email.v1";
const RATE_KEY_INFO = "agental:rate-limit-key";

/** Longer than any address a mailbox accepts; refused before the regex runs. */
const ResetEmail = z.string().max(320).trim().toLowerCase().email();

/** Thrown inside the reset transaction so nothing of it is kept. */
class AccountGone extends Error {}

/**
 * The error's class and, for Prisma, its code. The message stays out of the
 * log: a Prisma validation error quotes the query, and the query can hold an
 * email address.
 */
function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name} ${code}` : error.name;
}

/**
 * A keyed hash for rate-limit keys, so the RateLimitEvent table holds neither
 * an email address nor an IP, and a dump of it alone cannot be reversed by
 * trying every IPv4 address. The key is derived from AUTH_SECRET with a label
 * of its own.
 */
function rateKeyHash(value: string): string {
  const key = hkdfSync(
    "sha256",
    process.env.AUTH_SECRET ?? "",
    RATE_KEY_SALT,
    RATE_KEY_INFO,
    32
  );
  return createHmac("sha256", new Uint8Array(key)).update(value).digest("hex");
}

/**
 * x-real-ip is set by the platform; the first x-forwarded-for hop is whatever
 * the client chose to send. Requests carrying neither share one "unknown"
 * bucket, so a missing header tightens the limit instead of lifting it.
 */
function clientIp(hdrs: HeaderReader): string {
  return (
    hdrs.get("x-real-ip")?.trim() ||
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** The site origin for links, or null (logged) when it cannot be known. */
function baseUrlFrom(hdrs: HeaderReader): string | null {
  try {
    return siteBaseUrl(process.env, hdrs);
  } catch (error) {
    // siteBaseUrl's own messages name a variable and never quote a value.
    console.error(
      "[account-email]",
      error instanceof Error ? error.message : "the site URL is unknown"
    );
    return null;
  }
}

/**
 * Whether the person will get the email. Log mode counts in development,
 * where the link is printed for the developer. In production log mode prints
 * no link, so nothing reached anyone and the answer must say so.
 */
function delivered(sent: SendEmailResult): boolean {
  if (!sent.ok) return false;
  return sent.mode === "resend" || process.env.NODE_ENV !== "production";
}

/**
 * Count one confirmation email for a user. The minute limit goes first: a
 * click it refuses leaves the hourly count untouched.
 */
async function verificationEmailAllowed(
  userId: string,
  now: Date
): Promise<boolean> {
  const minute = await hitRateLimit(prisma, `email-verify:minute:${userId}`, {
    ...VERIFY_PER_MINUTE,
    now,
  });
  if (!minute.allowed) return false;
  const hour = await hitRateLimit(prisma, `email-verify:hour:${userId}`, {
    ...VERIFY_PER_HOUR,
    now,
  });
  return hour.allowed;
}

/** Issue a confirmation link and email it, in the user's language. */
async function deliverVerification(
  user: { id: string; email: string; locale: string },
  baseUrl: string,
  now: Date
): Promise<boolean> {
  const token = await createEmailToken(prisma, {
    purpose: "verify",
    userId: user.id,
    ttlMs: VERIFY_TTL_MS,
    now,
  });
  const locale = toLocale(user.locale);
  const sent = await sendEmail({
    to: user.email,
    kind: "verify",
    ...verificationEmail(locale, linkFor("verify", token, locale, baseUrl)),
  });
  return delivered(sent);
}

/**
 * Send the signed-in user a new confirmation link.
 *
 * An account whose address is confirmed, or that has no password (Google or
 * Apple confirmed the address), answers ok with `alreadyVerified: true` and
 * sends nothing.
 */
export async function requestEmailVerification(): Promise<RequestEmailVerificationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      locale: true,
      emailVerified: true,
      passwordHash: true,
    },
  });
  // A session can outlive its account.
  if (!user) return { ok: false, error: err("errors.unauthorized") };
  if (user.emailVerified || !user.passwordHash) {
    return { ok: true, alreadyVerified: true };
  }

  const now = new Date();
  if (!(await verificationEmailAllowed(user.id, now))) {
    return { ok: false, error: err("errors.tooManyAttempts") };
  }

  const baseUrl = baseUrlFrom(await headers());
  if (!baseUrl || !(await deliverVerification(user, baseUrl, now))) {
    return { ok: false, error: err("errors.emailSendFailed") };
  }
  return { ok: true, alreadyVerified: false };
}

/**
 * Confirm an address from the emailed link. Needs no session: the link may be
 * opened on another device than the one that signed up.
 *
 * The stamp is written only while emailVerified is still empty, together with
 * its audit entry. A link for an address confirmed in the meantime (a
 * password reset proves it too) answers ok and writes nothing.
 */
export async function verifyEmail(token: string): Promise<EmailActionResult> {
  const now = new Date();
  const consumed = await consumeEmailToken(prisma, {
    purpose: "verify",
    token,
    now,
  });
  if (!consumed.ok) {
    return {
      ok: false,
      error: err(
        consumed.reason === "expired"
          ? "errors.emailLinkExpired"
          : "errors.emailLinkInvalid"
      ),
    };
  }
  const { userId } = consumed;

  const accountExists = await prisma.$transaction(async (tx) => {
    const stamped = await tx.user.updateMany({
      where: { id: userId, emailVerified: null },
      data: { emailVerified: now },
    });
    if (stamped.count === 0) {
      // Already confirmed, or the account was deleted after the email left.
      const row = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      return row !== null;
    }
    await audit(
      {
        actorUserId: userId,
        action: "auth.email.verified",
        resourceType: "User",
        resourceId: userId,
      },
      tx
    );
    return true;
  });
  if (!accountExists) {
    return { ok: false, error: err("errors.emailLinkInvalid") };
  }
  // A verified email with a complete profile starts the first AI search.
  const { launchFirstAutoSearch } = await import("@/lib/auto-search");
  await launchFirstAutoSearch(userId);
  return { ok: true };
}

/**
 * The work behind a reset request: find the account, issue a link, email it.
 * It runs after the answer has left and reports only to the server log.
 *
 * Exactly one account must hold the address. With none there is nobody to
 * write to. With several, two old rows differ by letter case alone and the
 * mailbox cannot say which one is meant, so nothing is sent.
 */
async function deliverPasswordReset(
  address: string,
  baseUrl: string,
  now: Date
): Promise<void> {
  try {
    const users = await findUsersByEmail(prisma, address);
    if (users.length !== 1) return;
    const [user] = users;
    // Round 9: an account an admin deleted gets no email.
    if (user.deletedAt) return;
    const token = await createEmailToken(prisma, {
      purpose: "reset",
      userId: user.id,
      ttlMs: RESET_TTL_MS,
      now,
    });
    const locale = toLocale(user.locale);
    const sent = await sendEmail({
      to: user.email,
      kind: "reset",
      ...passwordResetEmail(locale, linkFor("reset", token, locale, baseUrl)),
    });
    if (!delivered(sent)) {
      console.error("[account-email] a password reset email was not sent");
    }
  } catch (error) {
    console.error(
      "[account-email] a password reset request failed:",
      errorLabel(error)
    );
  }
}

/**
 * Run `work` once the response is on its way. `after` keeps the function
 * alive on a serverless host until the work settles.
 */
function runAfterResponse(work: () => Promise<void>): void {
  try {
    after(work);
  } catch (error) {
    // `after` throws where the host gives it no way to outlive the response.
    // The work then starts here, unawaited, so the answer still takes the
    // same time for every address. The message is Next's own and holds no
    // request data.
    console.error(
      "[account-email] after() is unavailable:",
      error instanceof Error ? error.message : "unknown error"
    );
    void work();
  }
}

/**
 * Ask for a password reset link.
 *
 * The answer is `{ ok: true }` for every well-formed address: known, unknown,
 * or over a limit. The account lookup, the token and the email all happen
 * after the response, so neither the shape of the answer nor the time it
 * takes says whether an account exists.
 *
 * Limits, both counted before anything else: ten requests per hour per IP,
 * then three per hour per address. Their keys are keyed hashes.
 */
export async function requestPasswordReset(
  email: string,
  captcha?: string
): Promise<EmailActionResult> {
  const parsed = ResetEmail.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: err("errors.invalidInput") };
  }
  if (!(await captchaPassed(captcha))) return { ok: false, error: err("errors.captchaFailed") };
  const address = parsed.data;
  const hdrs = await headers();
  const now = new Date();

  const perIp = await hitRateLimit(
    prisma,
    `pw-reset:ip:${rateKeyHash(clientIp(hdrs))}`,
    { ...RESET_PER_IP, now }
  );
  if (!perIp.allowed) return { ok: true };
  const perEmail = await hitRateLimit(
    prisma,
    `pw-reset:email:${rateKeyHash(address)}`,
    { ...RESET_PER_EMAIL, now }
  );
  if (!perEmail.allowed) return { ok: true };

  // Read from the request now; the deferred work touches no request API.
  const baseUrl = baseUrlFrom(hdrs);
  if (baseUrl) {
    runAfterResponse(() => deliverPasswordReset(address, baseUrl, now));
  }
  return { ok: true };
}

/**
 * Set a new password from the emailed link. The person is left signed out
 * and signs in with the new password.
 *
 * The password is checked first, so a refused password leaves the link
 * usable for a second try. Then the token is used up, and one transaction
 * writes everything or nothing:
 *
 * - the new hash, and sessionsValidAfter set to now, which ends every session
 *   opened before this instant (see src/auth.ts);
 * - emailVerified, when it was empty: the link proved the address;
 * - any other pending reset link for the account, deleted;
 * - the audit entry.
 */
export async function resetPassword(
  token: string,
  password: string
): Promise<EmailActionResult> {
  const parsed = NewPassword.safeParse(password);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };

  const now = new Date();
  const consumed = await consumeEmailToken(prisma, {
    purpose: "reset",
    token,
    now,
  });
  if (!consumed.ok) {
    return {
      ok: false,
      error: err(
        consumed.reason === "expired"
          ? "errors.emailLinkExpired"
          : "errors.emailLinkInvalid"
      ),
    };
  }
  const { userId } = consumed;

  // Hashed only once the token has proven genuine: bcrypt is the costly step.
  const passwordHash = await bcrypt.hash(parsed.data, BCRYPT_COST);

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId },
        data: { passwordHash, sessionsValidAfter: now },
      });
      // The account was deleted after the email left.
      if (updated.count === 0) throw new AccountGone();
      const proven = await tx.user.updateMany({
        where: { id: userId, emailVerified: null },
        data: { emailVerified: now },
      });
      await revokeEmailTokens(tx, { purpose: "reset", userId });
      // What happened only. The password and its hash are written nowhere else.
      await audit(
        {
          actorUserId: userId,
          action: "auth.password.reset",
          resourceType: "User",
          resourceId: userId,
          after: { sessionsEnded: true, emailVerified: proven.count === 1 },
        },
        tx
      );
    });
  } catch (error) {
    if (error instanceof AccountGone) {
      return { ok: false, error: err("errors.emailLinkInvalid") };
    }
    throw error;
  }
  return { ok: true };
}

/**
 * Email a confirmation link to an account that was just created. Called by
 * signupAction; a helper, with no action result. It does nothing while the
 * deployment has no email sender, and a failure is logged and swallowed, so
 * sign-up can never fail because of it.
 *
 * It sits in a "use server" file, so the argument is treated as untrusted.
 * The row is read again and decides everything: the email goes to the stored
 * address, in the stored language, only for an unconfirmed password account
 * created in the last ten minutes, and it counts against the same limits as
 * requestEmailVerification.
 */
export async function sendVerificationForNewUser(user: {
  id: string;
  email: string;
  locale: string;
}): Promise<void> {
  try {
    if (!emailSenderConfigured()) return;
    if (typeof user?.id !== "string" || typeof user.email !== "string") return;

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        locale: true,
        emailVerified: true,
        passwordHash: true,
        createdAt: true,
      },
    });
    if (!row || row.emailVerified || !row.passwordHash) return;
    if (normalizeEmail(row.email) !== normalizeEmail(user.email)) return;

    const now = new Date();
    if (now.getTime() - row.createdAt.getTime() > NEW_USER_WINDOW_MS) return;
    if (!(await verificationEmailAllowed(row.id, now))) return;

    const baseUrl = baseUrlFrom(await headers());
    if (!baseUrl) return;
    if (!(await deliverVerification(row, baseUrl, now))) {
      console.error("[account-email] the first confirmation email was not sent");
    }
  } catch (error) {
    console.error(
      "[account-email] the first confirmation email failed:",
      errorLabel(error)
    );
  }
}

/* ── Round 10: the 6-digit sign-up code ─────────────────────────────────── */

export type EmailCodeActionResult =
  | { ok: true; alreadyVerified?: boolean }
  | { ok: false; error: ActionError; codePending?: boolean };

/**
 * "Send me a code" (the code screen after sign-up and the "Verify your email"
 * banner). At most 5 code emails a day per account, on top of the 60-second wait.
 */
export async function sendMyEmailCode(): Promise<EmailCodeActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
    const day = await hitRateLimit(prisma, `email-code-send:${session.user.id}`, { limit: 5, windowMs: 24 * HOUR_MS });
    if (!day.allowed) return { ok: false, error: err("errors.codeDailyLimit") };
    const { sendEmailCode } = await import("@/lib/email-code");
    const res = await sendEmailCode({ userId: session.user.id });
    if (res.ok) return { ok: true };
    if (res.reason === "already") return { ok: true, alreadyVerified: true };
    if (res.reason === "too_soon") {
      return {
        ok: false,
        codePending: true,
        error: err("errors.codeTooSoon", { seconds: Math.ceil((res.retryInMs ?? 60_000) / 1000) }),
      };
    }
    return { ok: false, error: err("errors.codeUnavailable") };
  } catch (error) {
    console.error("[account-email] code send failed:", errorLabel(error));
    return { ok: false, error: err("errors.generic") };
  }
}

/** Check the 6-digit code; a match verifies the email. */
export async function confirmMyEmailCode(code: unknown): Promise<EmailCodeActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
    const parsed = z.string().max(12).safeParse(code);
    if (!parsed.success) return { ok: false, error: err("errors.codeWrong", { left: 0 }) };
    const limit = await hitRateLimit(prisma, `email-code:${session.user.id}`, { limit: 30, windowMs: HOUR_MS });
    if (!limit.allowed) return { ok: false, error: err("errors.codeLocked") };
    const { verifyEmailCode } = await import("@/lib/email-code");
    const res = await verifyEmailCode({ userId: session.user.id, code: parsed.data });
    if (res.ok) return { ok: true };
    if (res.reason === "wrong") return { ok: false, error: err("errors.codeWrong", { left: res.attemptsLeft ?? 0 }) };
    if (res.reason === "locked") return { ok: false, error: err("errors.codeLocked") };
    if (res.reason === "expired") return { ok: false, error: err("errors.codeExpired") };
    return { ok: false, error: err("errors.codeWrong", { left: 0 }) };
  } catch (error) {
    console.error("[account-email] code check failed:", errorLabel(error));
    return { ok: false, error: err("errors.generic") };
  }
}
