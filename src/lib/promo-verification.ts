import { createHmac, hkdfSync, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { emailSenderConfigured, sendEmail } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { promoCodeEmail } from "@/lib/email-templates";
import {
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_MS,
  CODE_TTL_MS,
  USC_PROMOTION_ID,
  isSixDigits,
  isUscEmail,
} from "@/domain/promo-verification";

/** A keyed hash of the code: the code itself is never stored. */
function hashCode(userId: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  const key = hkdfSync("sha256", secret, "agental:promo-code", "usc-code", 32);
  return createHmac("sha256", new Uint8Array(key)).update(`${userId}:${code}`).digest("hex");
}

export type SendCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email" | "already" | "taken" | "too_soon" | "unavailable" | "send_failed"; retryInMs?: number };

/**
 * Send a 6-digit code to a @usc.edu address. A new code replaces the
 * account's earlier ones; a resend waits 60 seconds. When no email sender is
 * set up in production, nothing is stored and the caller says so plainly.
 */
export async function sendUscCode(input: { userId: string; email: string; locale: string; now?: Date }): Promise<SendCodeResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  if (!isUscEmail(email)) return { ok: false, reason: "invalid_email" };
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { uscVerifiedAt: true } });
  if (user?.uscVerifiedAt) return { ok: false, reason: "already" };
  // One @usc.edu address verifies one account.
  const owner = await prisma.user.findUnique({ where: { uscVerifiedEmail: email }, select: { id: true } });
  if (owner && owner.id !== input.userId) return { ok: false, reason: "taken" };

  const last = await prisma.promoVerificationCode.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (last && now.getTime() - last.createdAt.getTime() < CODE_RESEND_MS) {
    return { ok: false, reason: "too_soon", retryInMs: CODE_RESEND_MS - (now.getTime() - last.createdAt.getTime()) };
  }

  const production = process.env.NODE_ENV === "production";
  if (production && !emailSenderConfigured()) {
    // Said out loud in the logs, without the address.
    console.warn("[promo] USC code not sent: RESEND_API_KEY or EMAIL_FROM is not set");
    return { ok: false, reason: "unavailable" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Send first: a failed send keeps the earlier code working.
  try {
    const sent = await sendEmail({ to: email, kind: "usc_code", ...promoCodeEmail(input.locale, code) });
    if (!sent.ok) return { ok: false, reason: "send_failed" };
    if (sent.mode === "log" && !production) console.info(`[promo] local only, USC code for ${input.userId}: ${code}`);
  } catch {
    return { ok: false, reason: "send_failed" };
  }
  // The new code replaces the account's earlier ones.
  await prisma.$transaction([
    prisma.promoVerificationCode.deleteMany({ where: { userId: input.userId, consumedAt: null } }),
    prisma.promoVerificationCode.create({
      data: {
        userId: input.userId,
        promotionId: USC_PROMOTION_ID,
        email,
        codeHash: hashCode(input.userId, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    }),
  ]);
  return { ok: true };
}

export type VerifyCodeResult =
  | { ok: true; verifiedAt: Date; email: string }
  | { ok: false; reason: "invalid" | "expired" | "locked" | "wrong" | "taken"; attemptsLeft?: number };

/** Check a code: 10 minutes, 5 attempts. A match marks the account "USC student verified". */
export async function verifyUscCode(input: { userId: string; code: string; now?: Date }): Promise<VerifyCodeResult> {
  const now = input.now ?? new Date();
  const code = input.code.trim();
  if (!isSixDigits(code)) return { ok: false, reason: "invalid" };
  const row = await prisma.promoVerificationCode.findFirst({
    where: { userId: input.userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt <= now) return { ok: false, reason: "expired" };
  // Take one attempt before comparing, under a guard: parallel tries cannot
  // get past 5.
  const took = await prisma.promoVerificationCode.updateMany({
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
  const owner = await prisma.user.findUnique({ where: { uscVerifiedEmail: row.email }, select: { id: true } });
  if (owner && owner.id !== input.userId) return { ok: false, reason: "taken" };
  const { count } = await prisma.promoVerificationCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (count !== 1) return { ok: false, reason: "expired" };
  await prisma.user.update({ where: { id: input.userId }, data: { uscVerifiedAt: now, uscVerifiedEmail: row.email } });
  await audit({ actorUserId: input.userId, action: "promotion.usc.verified", resourceType: "User", resourceId: input.userId });
  return { ok: true, verifiedAt: now, email: row.email };
}
