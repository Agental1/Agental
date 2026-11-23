import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { emailSenderConfigured, sendEmail } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { signupCodeEmail } from "@/lib/email-templates";
import { CODE_MAX_ATTEMPTS, CODE_RESEND_MS, CODE_TTL_MS, isSixDigits } from "@/domain/promo-verification";

/**
 * Round 10, group 2: the 6-digit code that verifies the email of a password
 * sign-up, sent from contact@agental.co right after "Create account" and from
 * the "Verify your email" banner. The same rules as the USC code: 10 minutes,
 * 5 attempts, a resend after 60 seconds, a new code replaces the earlier ones,
 * only a keyed hash is stored. Google accounts never need it.
 */

function hashCode(userId: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  const key = hkdfSync("sha256", secret, "agental:email-code", "signup-code", 32);
  return createHmac("sha256", new Uint8Array(key)).update(`${userId}:${code}`).digest("hex");
}

export type SendEmailCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "already" | "no_account" | "too_soon" | "unavailable" | "send_failed" | "daily_limit"; retryInMs?: number };

/** Can a code reach anyone from this deployment? (Production needs Resend.) */
export function emailCodeAvailable(): boolean {
  return process.env.NODE_ENV !== "production" || emailSenderConfigured();
}

export async function sendEmailCode(input: {
  userId: string;
  now?: Date;
  /** Checked only when a code is about to go out (the daily cap): false refuses. */
  allowSend?: () => Promise<boolean>;
}): Promise<SendEmailCodeResult> {
  const now = input.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, emailVerified: true, locale: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return { ok: false, reason: "no_account" };
  if (user.emailVerified) return { ok: false, reason: "already" };

  const last = await prisma.emailVerificationCode.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && now.getTime() - last.createdAt.getTime() < CODE_RESEND_MS) {
    return { ok: false, reason: "too_soon", retryInMs: CODE_RESEND_MS - (now.getTime() - last.createdAt.getTime()) };
  }

  const production = process.env.NODE_ENV === "production";
  if (!emailCodeAvailable()) {
    console.warn("[email-code] not sent: RESEND_API_KEY or EMAIL_FROM is not set");
    return { ok: false, reason: "unavailable" };
  }

  if (input.allowSend && !(await input.allowSend())) return { ok: false, reason: "daily_limit" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  try {
    const sent = await sendEmail({ to: user.email, kind: "signup_code", ...signupCodeEmail(user.locale, code) });
    if (!sent.ok) return { ok: false, reason: "send_failed" };
    if (sent.mode === "log" && !production) console.info(`[email-code] local only, code for ${input.userId}: ${code}`);
  } catch {
    return { ok: false, reason: "send_failed" };
  }
  await prisma.$transaction([
    prisma.emailVerificationCode.deleteMany({ where: { userId: input.userId, consumedAt: null } }),
    prisma.emailVerificationCode.create({
      data: {
        userId: input.userId,
        email: user.email,
        codeHash: hashCode(input.userId, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    }),
  ]);
  return { ok: true, email: user.email };
}

export type VerifyEmailCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "locked" | "wrong"; attemptsLeft?: number };

/** Check a code. A match stamps emailVerified and starts the first automatic search when due. */
export async function verifyEmailCode(input: { userId: string; code: string; now?: Date }): Promise<VerifyEmailCodeResult> {
  const now = input.now ?? new Date();
  const code = input.code.replace(/\s/g, "");
  if (!isSixDigits(code)) return { ok: false, reason: "invalid" };
  const row = await prisma.emailVerificationCode.findFirst({
    where: { userId: input.userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt <= now) return { ok: false, reason: "expired" };
  // One attempt taken before comparing, under a guard: parallel tries cannot pass 5.
  const took = await prisma.emailVerificationCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (took.count !== 1) return { ok: false, reason: "locked" };

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(input.userId, code), "hex");
  const match = expected.length === given.length && timingSafeEqual(expected, given);
  if (!match) {
    const left = CODE_MAX_ATTEMPTS - (row.attempts + 1);
    return left <= 0 ? { ok: false, reason: "locked" } : { ok: false, reason: "wrong", attemptsLeft: left };
  }

  const verified = await prisma.$transaction(async (tx) => {
    const used = await tx.emailVerificationCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (used.count !== 1) return false;
    // The code proves the address it was sent to: a changed email is not verified by it.
    const stamped = await tx.user.updateMany({
      where: { id: input.userId, email: row.email, emailVerified: null },
      data: { emailVerified: now },
    });
    if (stamped.count === 1) {
      await audit(
        { actorUserId: input.userId, action: "auth.email.verified", resourceType: "User", resourceId: input.userId, after: { via: "code" } },
        tx
      );
      return true;
    }
    // Already verified (another tab): fine. Otherwise the address changed since
    // the code left, and the code proves nothing about the new one.
    const now2 = await tx.user.findUnique({ where: { id: input.userId }, select: { emailVerified: true } });
    return !!now2?.emailVerified;
  });
  if (!verified) return { ok: false, reason: "expired" };
  const { launchFirstAutoSearch } = await import("@/lib/auto-search");
  await launchFirstAutoSearch(input.userId).catch(() => {});
  return { ok: true };
}
