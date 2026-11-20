import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendEmail, type SendEmailResult } from "@/lib/mailer";
import { hitRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { studentEmail } from "@/lib/email-templates";
import { toLocale } from "@/i18n/routing";
import { STUDENT_DISCOUNT, isSchoolEmail } from "@/domain/student";

/**
 * "College student? Verify your school email." The performer gives a school
 * address; a link goes to that address; opening it proves the performer reads
 * that inbox. Then User.studentEmail and User.studentVerifiedAt are set.
 *
 * Rules: the address must end with an allowed school domain; one school
 * address verifies one account (unique column, checked before sending and
 * again when confirming); a few sends per hour per account; links expire.
 * Only a SHA-256 of the token is stored.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type RequestStudentResult =
  | { ok: true; delivered: boolean }
  | { ok: false; reason: "not_school" | "taken" | "already" | "rate_limited" | "send_failed" };

export async function requestStudentVerification(input: {
  userId: string;
  email: string;
  locale: string;
  baseUrl: string;
  now?: Date;
}): Promise<RequestStudentResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  if (!isSchoolEmail(email)) return { ok: false, reason: "not_school" };

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { studentVerifiedAt: true, studentEmail: true },
  });
  if (user?.studentVerifiedAt && user.studentEmail) return { ok: false, reason: "already" };
  const owner = await prisma.user.findUnique({ where: { studentEmail: email }, select: { id: true } });
  if (owner && owner.id !== input.userId) return { ok: false, reason: "taken" };

  const limit = await hitRateLimit(prisma, `student-email:${input.userId}`, {
    limit: STUDENT_DISCOUNT.sendsPerHour,
    windowMs: 60 * 60 * 1000,
    now,
  });
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const token = randomBytes(32).toString("base64url");
  // A new link replaces the account's earlier pending ones.
  await prisma.studentEmailClaim.deleteMany({ where: { userId: input.userId, confirmedAt: null } });
  await prisma.studentEmailClaim.create({
    data: {
      userId: input.userId,
      email,
      tokenHash: hash(token),
      expiresAt: new Date(now.getTime() + STUDENT_DISCOUNT.linkTtlMs),
    },
  });
  const locale = toLocale(input.locale);
  const link = `${input.baseUrl.replace(/\/+$/, "")}/${locale}/etudiant?token=${encodeURIComponent(token)}`;
  let sent: SendEmailResult;
  try {
    sent = await sendEmail({ to: email, ...studentEmail(locale, link) });
  } catch {
    return { ok: false, reason: "send_failed" };
  }
  if (!sent.ok) return { ok: false, reason: "send_failed" };
  // In production, log mode reaches nobody: say so instead of "check your inbox".
  const delivered = sent.mode === "resend" || process.env.NODE_ENV !== "production";
  return { ok: true, delivered };
}

export type ConfirmStudentResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" | "taken" };

/** Use a link. The claim row is consumed whatever the outcome. */
export async function confirmStudentEmail(token: unknown, now = new Date()): Promise<ConfirmStudentResult> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return { ok: false, reason: "invalid" };
  const claim = await prisma.studentEmailClaim.findUnique({ where: { tokenHash: hash(token) } });
  if (!claim || claim.confirmedAt) return { ok: false, reason: "invalid" };
  const used = await prisma.studentEmailClaim.updateMany({
    where: { id: claim.id, confirmedAt: null },
    data: { confirmedAt: now },
  });
  if (used.count === 0) return { ok: false, reason: "invalid" };
  if (claim.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };

  try {
    await prisma.user.update({
      where: { id: claim.userId },
      data: { studentEmail: claim.email, studentVerifiedAt: now },
    });
  } catch (error) {
    // Unique index: another account proved this address first.
    if ((error as { code?: string }).code === "P2002") return { ok: false, reason: "taken" };
    throw error;
  }
  await audit({
    actorUserId: claim.userId,
    action: "student.email.verified",
    resourceType: "User",
    resourceId: claim.userId,
  });
  return { ok: true, email: claim.email };
}
