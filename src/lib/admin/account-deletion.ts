import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emailIsVerified } from "@/lib/agents";
import { getStorage } from "@/lib/storage";
import { sendEmail } from "@/lib/mailer";
import { deletionWarningEmail } from "@/lib/email-templates";
import { createEmailToken, linkFor } from "@/lib/email-tokens";
import { confirmationPhrase, deletionEligible } from "@/domain/account-deletion";

/**
 * Admin > Account cleanup: fake accounts (never verified, older than N days,
 * never paid, not staff or test). Server only; every caller checks
 * currentAdminId(). The rule is src/domain/account-deletion.ts.
 */

export interface DeletionCandidate {
  id: string;
  email: string;
  kind: string;
  createdAt: Date;
  accountStatus: string;
  warnedAt: Date | null;
  mediaCount: number;
}

/** The accounts the rule allows to delete today, oldest first. */
export async function listDeletionCandidates(days: number, now = new Date()): Promise<DeletionCandidate[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // A first cut in the database (never verified, a password account, old
  // enough, not admin), then the full rule with payments, per account.
  const users = await prisma.user.findMany({
    where: { emailVerified: null, passwordHash: { not: null }, createdAt: { lte: cutoff }, isAdmin: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      kind: true,
      createdAt: true,
      isAdmin: true,
      accountStatus: true,
      deletionWarnedAt: true,
      emailVerified: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
      artistProfile: { select: { _count: { select: { media: true } } } },
    },
  });
  if (users.length === 0) return [];
  const paid = await paidUserIds(users.map((u) => u.id));
  return users
    .filter((u) =>
      deletionEligible(
        {
          verifiedAt: emailIsVerified(u),
          createdAt: u.createdAt,
          paid: paid.has(u.id),
          accountStatus: u.accountStatus,
          isAdmin: u.isAdmin,
        },
        now,
        days
      )
    )
    .map((u) => ({
      id: u.id,
      email: u.email,
      kind: u.kind,
      createdAt: u.createdAt,
      accountStatus: u.accountStatus,
      warnedAt: u.deletionWarnedAt,
      mediaCount: u.artistProfile?._count.media ?? 0,
    }));
}

/**
 * Anyone who ever paid: a Limelight order paid (or refunded), or a
 * subscription with a Stripe id or a paid plan. These records are kept.
 */
async function paidUserIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const orders = await prisma.siteOrder.findMany({
    where: { userId: { in: ids }, OR: [{ paidAt: { not: null } }, { status: { in: ["PAID", "REFUNDED"] } }] },
    select: { userId: true },
  });
  for (const o of orders) if (o.userId) out.add(o.userId);
  const subs = await prisma.subscription.findMany({
    where: { subjectType: "ARTIST", subjectId: { in: ids }, OR: [{ stripeSubscriptionId: { not: null } }, { plan: { not: "FREE" } }] },
    select: { subjectId: true },
  });
  for (const s of subs) out.add(s.subjectId);
  return out;
}

export function deletionCsv(rows: DeletionCandidate[]): string {
  const cell = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? "");
    // A leading =, +, - or @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["id", "email", "audience", "created", "status", "warned", "media"];
  const body = rows.map((r) => [r.id, r.email, r.kind, r.createdAt, r.accountStatus, r.warnedAt ?? "", r.mediaCount].map(cell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

/**
 * Email every candidate not warned yet: "confirm within N days or the
 * account is deleted", with a confirmation link valid N days. Returns how
 * many emails went out.
 */
export async function sendDeletionWarnings(adminId: string, days: number, baseUrl: string, now = new Date()) {
  const rows = (await listDeletionCandidates(days, now)).filter((r) => !r.warnedAt);
  let sent = 0;
  for (const r of rows) {
    const user = await prisma.user.findUnique({ where: { id: r.id }, select: { locale: true } });
    const token = await createEmailToken(prisma, {
      purpose: "verify",
      userId: r.id,
      ttlMs: days * 24 * 60 * 60 * 1000,
      now,
    });
    const locale = user?.locale ?? "en";
    const res = await sendEmail({ to: r.email, ...deletionWarningEmail(locale, linkFor("verify", token, locale, baseUrl), days) });
    if (!res.ok) continue;
    await prisma.user.update({ where: { id: r.id }, data: { deletionWarnedAt: now } });
    sent += 1;
  }
  await audit({
    actorUserId: adminId,
    action: "admin.accounts.deletionWarning",
    resourceType: "User",
    resourceId: "*",
    after: { days, candidates: rows.length, sent },
  });
  return { candidates: rows.length, sent };
}

export type DeleteResult =
  | { ok: true; deleted: number; failed: number }
  | { ok: false; reason: "confirmation" | "empty" };

const hashEmail = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/**
 * Delete every account on the list, after the typed confirmation
 * ("DELETE <count>", the count on screen). Each account is checked against the
 * rule again right before it goes. Files first (media, self-tapes, profile
 * picture, unfinished uploads), then the user row, which cascades to the
 * profile, media rows, messages and searches. One audit entry per account
 * keeps the id, a hash of the email and the creation date, never the address.
 */
export async function deleteEligibleAccounts(
  adminId: string,
  days: number,
  typed: string,
  now = new Date()
): Promise<DeleteResult> {
  const rows = await listDeletionCandidates(days, now);
  if (rows.length === 0) return { ok: false, reason: "empty" };
  if (typed.trim() !== confirmationPhrase(rows.length)) return { ok: false, reason: "confirmation" };

  const storage = await getStorage();
  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    // Re-read: a person may have confirmed their email a second ago.
    const still = (await listDeletionCandidates(days, now)).some((c) => c.id === r.id);
    if (!still) continue;
    try {
      const profile = await prisma.artistProfile.findUnique({
        where: { userId: r.id },
        select: { id: true, avatarKey: true, media: { select: { storageKey: true } } },
      });
      const uploads = profile
        ? await prisma.upload.findMany({ where: { profileId: profile.id }, select: { storageKey: true } })
        : [];
      const keys = [
        ...(profile?.media.map((m) => m.storageKey) ?? []),
        ...(profile?.avatarKey ? [profile.avatarKey] : []),
        ...uploads.map((u) => u.storageKey),
      ].filter((k, i, all) => all.indexOf(k) === i);
      for (const key of keys) {
        await storage.delete(key).catch((error) => {
          console.error("[account-deletion] stored object not removed", { userId: r.id, error: error instanceof Error ? error.name : "unknown" });
        });
      }
      await prisma.user.delete({ where: { id: r.id } });
      await audit({
        actorUserId: adminId,
        action: "admin.account.delete",
        resourceType: "User",
        resourceId: r.id,
        before: { emailSha256: hashEmail(r.email), kind: r.kind, createdAt: r.createdAt.toISOString(), files: keys.length },
        after: { deleted: true, rule: "unverified", days },
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error("[account-deletion] account not deleted", { userId: r.id, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    }
  }
  return { ok: true, deleted, failed };
}
