"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";
import { isAdminAccount } from "@/domain/admin";
import { err, type ActionError } from "@/domain/action-result";
import { verifyTotp } from "@/domain/totp";
import { decryptSecret, setMfaCookie } from "@/lib/admin-mfa";

/** Five codes per 15 minutes per admin: a 6-digit code cannot be guessed. */
const ADMIN_CODE_RATE = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

export type AdminCodeResult = { ok: true } | { ok: false; error: ActionError };

/**
 * Round 8d: an admin types the 6-digit code of their authenticator app. The
 * first good code finishes the enrollment; later ones open the admin for
 * ADMIN_MFA_HOURS. Each code works once. Every attempt is in the audit log.
 */
export async function submitAdminCode(code: unknown): Promise<AdminCodeResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: err("errors.unauthorized") };
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, email: true } });
  if (!isAdminAccount(me)) return { ok: false, error: err("errors.forbidden") };
  if (typeof code !== "string" || code.length > 12) return { ok: false, error: err("errors.adminCodeWrong") };

  const gate = await hitRateLimit(prisma, `admin-mfa:${userId}`, ADMIN_CODE_RATE);
  if (!gate.allowed) return { ok: false, error: err("errors.tooManyAttempts") };

  const row = await prisma.adminTotp.findUnique({ where: { userId } });
  if (!row) return { ok: false, error: err("errors.adminCodeWrong") };
  const now = new Date();
  const step = verifyTotp(decryptSecret(row.secretEnc), code, now, row.lastStep);
  if (step === null) {
    await audit({ actorUserId: userId, action: "admin.mfa.fail", resourceType: "User", resourceId: userId });
    return { ok: false, error: err("errors.adminCodeWrong") };
  }
  // Conditional on the step just read: the same code sent twice counts once.
  const used = await prisma.adminTotp.updateMany({
    where: { userId, lastStep: row.lastStep },
    data: { lastStep: step, verifiedAt: row.verifiedAt ?? now },
  });
  if (used.count !== 1) return { ok: false, error: err("errors.adminCodeWrong") };
  await audit({
    actorUserId: userId,
    action: row.verifiedAt ? "admin.mfa.verify" : "admin.mfa.enroll",
    resourceType: "User",
    resourceId: userId,
  });
  await setMfaCookie(userId);
  return { ok: true };
}
