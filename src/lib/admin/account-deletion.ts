import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emailIsVerified } from "@/lib/agents";
import { getStorage } from "@/lib/storage";
import { emailSenderConfigured, sendEmail } from "@/lib/mailer";
import { deletionWarningEmail } from "@/lib/email-templates";
import { createEmailToken, linkFor } from "@/lib/email-tokens";
import {
  DELETION_BATCH,
  confirmationPhrase,
  deletionEligible,
  listFingerprint,
  warningLinkTtlMs,
} from "@/domain/account-deletion";

/**
 * Admin > Account cleanup: fake accounts (never verified, older than N days,
 * never paid, no organization, not staff, test or approved). Server only;
 * every caller checks currentAdminId(). The rule is
 * src/domain/account-deletion.ts.
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

/** Tests only: limit the list to their own rows, so local data is never touched. */
export interface DeletionScope {
  emailPrefix?: string;
}

const CANDIDATE_SELECT = {
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
} as const;

/** The accounts the rule allows to delete today, oldest first. */
export async function listDeletionCandidates(
  days: number,
  now = new Date(),
  scope: DeletionScope = {}
): Promise<DeletionCandidate[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // A first cut in the database (never verified, a password account, old
  // enough, not admin), then the full rule with payments, per account.
  const users = await prisma.user.findMany({
    where: {
      emailVerified: null,
      passwordHash: { not: null },
      createdAt: { lte: cutoff },
      isAdmin: false,
      ...(scope.emailPrefix ? { email: { startsWith: scope.emailPrefix } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: CANDIDATE_SELECT,
  });
  if (users.length === 0) return [];
  const paid = await protectedUserIds(users.map((u) => u.id));
  return users
    .filter((u) =>
      deletionEligible(
        {
          verifiedAt: emailIsVerified(u),
          createdAt: u.createdAt,
          paid: paid.has(u.id),
          accountStatus: u.accountStatus,
          isAdmin: u.isAdmin,
          warnedAt: u.deletionWarnedAt,
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
 * Anyone who ever paid (a Limelight order paid or refunded, a subscription
 * with a Stripe id or a paid plan) and anyone in an organization, whose plan
 * may be paid and which would be left without its member. These are kept.
 */
async function protectedUserIds(ids: string[]): Promise<Set<string>> {
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
  const members = await prisma.membership.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
  for (const m of members) out.add(m.userId);
  return out;
}

/** The fingerprint of the list as shown, for the confirmation form. */
export function candidatesFingerprint(rows: DeletionCandidate[], days: number): string {
  return listFingerprint(rows.map((r) => r.id), days);
}

export function deletionCsv(rows: DeletionCandidate[]): string {
  const cell = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? "");
    // A leading =, +, -, @, tab or carriage return would run as a formula.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ["id", "email", "audience", "created", "status", "warned", "media"];
  const body = rows.map((r) => [r.id, r.email, r.kind, r.createdAt, r.accountStatus, r.warnedAt ?? "", r.mediaCount].map(cell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

export type WarnResult =
  | { ok: true; candidates: number; sent: number; remaining: number }
  | { ok: false; reason: "no_sender" };

/**
 * Email the candidates not warned yet, at most DELETION_BATCH per click:
 * "confirm within N days or the account is deleted", with a confirmation link
 * valid min(N, 7) days. Each row is claimed before its email goes out, so a
 * double submit or two admins never send twice; a failed send releases it.
 * Refused when no email sender is configured: nothing would reach anyone.
 */
export async function sendDeletionWarnings(
  adminId: string,
  days: number,
  baseUrl: string,
  now = new Date(),
  scope: DeletionScope = {}
): Promise<WarnResult> {
  if (!emailSenderConfigured()) return { ok: false, reason: "no_sender" };
  const all = (await listDeletionCandidates(days, now, scope)).filter((r) => !r.warnedAt);
  const batch = all.slice(0, DELETION_BATCH);
  let sent = 0;
  for (const r of batch) {
    const claimed = await prisma.user.updateMany({
      where: { id: r.id, deletionWarnedAt: null, emailVerified: null },
      data: { deletionWarnedAt: now },
    });
    if (claimed.count !== 1) continue;
    const user = await prisma.user.findUnique({ where: { id: r.id }, select: { locale: true } });
    const locale = user?.locale ?? "en";
    const token = await createEmailToken(prisma, { purpose: "verify", userId: r.id, ttlMs: warningLinkTtlMs(days), now });
    const res = await sendEmail({ to: r.email, kind: "deletion_warning", ...deletionWarningEmail(locale, linkFor("verify", token, locale, baseUrl), days) });
    if (!res.ok || res.mode !== "resend") {
      await prisma.user.updateMany({ where: { id: r.id, deletionWarnedAt: now }, data: { deletionWarnedAt: null } });
      continue;
    }
    sent += 1;
  }
  await audit({
    actorUserId: adminId,
    action: "admin.accounts.deletionWarning",
    resourceType: "User",
    resourceId: "*",
    after: { days, candidates: batch.length, sent },
  });
  return { ok: true, candidates: batch.length, sent, remaining: all.length - batch.length };
}

export type DeleteResult =
  | { ok: true; deleted: number; failed: number; remaining: number }
  | { ok: false; reason: "confirmation" | "empty" | "changed" };

const hashEmail = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/**
 * Delete the accounts on the list, after the typed confirmation
 * ("DELETE <count>") and only if the list is exactly the one shown
 * (`fingerprint`). At most DELETION_BATCH per click. Two admins at once are
 * safe: the conditional delete below matches nothing the second time.
 *
 * Per account: the row goes first, with a conditional delete that repeats the
 * rule in the database (still unverified, not admin, not staff, test or
 * approved, not warned within the window) inside a transaction that also
 * re-checks payments and memberships. Someone who verified a second ago is
 * kept. Only then are the files removed (media, self-tapes, profile picture,
 * unfinished uploads); a storage failure is logged with the key. Pending email
 * links are removed too. One audit entry per account keeps the id, a hash of
 * the email and the creation date, never the address.
 */
export async function deleteEligibleAccounts(
  adminId: string,
  days: number,
  typed: string,
  fingerprint: string,
  now = new Date(),
  scope: DeletionScope = {}
): Promise<DeleteResult> {
  const rows = await listDeletionCandidates(days, now, scope);
  if (rows.length === 0) return { ok: false, reason: "empty" };
  if (typed.trim() !== confirmationPhrase(rows.length)) return { ok: false, reason: "confirmation" };
  if (fingerprint !== candidatesFingerprint(rows, days)) return { ok: false, reason: "changed" };

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const storage = await getStorage();
  const batch = rows.slice(0, DELETION_BATCH);
  let deleted = 0;
  let failed = 0;
  for (const r of batch) {
    try {
      const gone = await prisma.$transaction(async (tx) => {
        const profile = await tx.artistProfile.findUnique({
          where: { userId: r.id },
          select: { id: true, avatarKey: true, media: { select: { storageKey: true } } },
        });
        const uploads = profile
          ? await tx.upload.findMany({ where: { profileId: profile.id }, select: { storageKey: true } })
          : [];
        const paid =
          (await tx.siteOrder.count({ where: { userId: r.id, OR: [{ paidAt: { not: null } }, { status: { in: ["PAID", "REFUNDED"] } }] } })) +
          (await tx.subscription.count({ where: { subjectType: "ARTIST", subjectId: r.id, OR: [{ stripeSubscriptionId: { not: null } }, { plan: { not: "FREE" } }] } })) +
          (await tx.membership.count({ where: { userId: r.id } }));
        if (paid > 0) return null;
        const { count } = await tx.user.deleteMany({
          where: {
            id: r.id,
            emailVerified: null,
            passwordHash: { not: null },
            isAdmin: false,
            createdAt: { lte: cutoff },
            accountStatus: { notIn: ["STAFF", "TEST", "APPROVED"] },
            OR: [{ deletionWarnedAt: null }, { deletionWarnedAt: { lte: cutoff } }],
          },
        });
        if (count !== 1) return null;
        await tx.verificationToken.deleteMany({ where: { identifier: { in: [`verify:${r.id}`, `reset:${r.id}`] } } });
        // The email log keeps no trace of a deleted address.
        await tx.emailLog.deleteMany({ where: { to: { equals: r.email, mode: "insensitive" } } });
        return [
          ...(profile?.media.map((m) => m.storageKey) ?? []),
          ...(profile?.avatarKey ? [profile.avatarKey] : []),
          ...uploads.map((u) => u.storageKey),
        ].filter((k, i, all) => all.indexOf(k) === i);
      });
      if (!gone) continue;
      for (const key of gone) {
        await storage.delete(key).catch((error) => {
          console.error("[account-deletion] stored object not removed, retry by key", {
            key,
            error: error instanceof Error ? error.name : "unknown",
          });
        });
      }
      await audit({
        actorUserId: adminId,
        action: "admin.account.delete",
        resourceType: "User",
        resourceId: r.id,
        before: { emailSha256: hashEmail(r.email), kind: r.kind, createdAt: r.createdAt.toISOString(), files: gone.length },
        after: { deleted: true, rule: "unverified", days },
      });
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error("[account-deletion] account not deleted", {
        userId: r.id,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }
  await audit({
    actorUserId: adminId,
    action: "admin.accounts.deletionRun",
    resourceType: "User",
    resourceId: "*",
    after: { days, listed: rows.length, deleted, failed, remaining: rows.length - batch.length },
  });
  return { ok: true, deleted, failed, remaining: rows.length - batch.length };
}
