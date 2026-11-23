import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { emailSenderConfigured, sendEmail } from "@/lib/mailer";
import { deletionWarningEmail } from "@/lib/email-templates";
import { createEmailToken, linkFor } from "@/lib/email-tokens";
import { warningLinkTtlMs } from "@/domain/account-deletion";
import { REMOVAL_BATCH, RESTORE_DAYS, purgeDate, purgeDue, removalBlock, type RemovalBlock } from "@/domain/account-removal";

/**
 * Round 9, group 1: "Delete" and "Send warning email" on the ticked rows of
 * Admin > Accounts, the "Deleted" list (restorable for 30 days), and the
 * purge. Server only; every caller checks currentAdminId(). The rule is
 * src/domain/account-removal.ts.
 *
 * Deleting is in two steps:
 *   1. now: deletedAt is set, the status becomes REVOKED (the agents stop,
 *      the previous status is kept for a restore), sessions end and sign-in
 *      is refused (src/auth.ts). Nothing else is touched.
 *   2. after 30 days: the row is removed (everything attached cascades) and
 *      its files are removed from storage. One audit entry per step.
 */

/** The warning the brief asks for: confirm within 7 days. */
export const WARNING_DAYS = 7;

const hashEmail = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

/** Anyone who paid or belongs to an organization (never selectable). */
export async function paidUserIds(ids: string[], db = prisma): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const orders = await db.siteOrder.findMany({
    where: { userId: { in: ids }, OR: [{ paidAt: { not: null } }, { status: { in: ["PAID", "REFUNDED"] } }] },
    select: { userId: true },
  });
  for (const o of orders) if (o.userId) out.add(o.userId);
  const subs = await db.subscription.findMany({
    where: { subjectType: "ARTIST", subjectId: { in: ids }, OR: [{ stripeSubscriptionId: { not: null } }, { plan: { not: "FREE" } }] },
    select: { subjectId: true },
  });
  for (const s of subs) out.add(s.subjectId);
  const members = await db.membership.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
  for (const m of members) out.add(m.userId);
  return out;
}

/** For each id, why it cannot be selected (absent when it can). */
export async function removalBlocks(ids: string[]): Promise<Map<string, RemovalBlock>> {
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, isAdmin: true, accountStatus: true, deletedAt: true },
  });
  const paid = await paidUserIds(users.map((u) => u.id));
  const out = new Map<string, RemovalBlock>();
  for (const u of users) {
    const b = removalBlock({ isAdmin: u.isAdmin, accountStatus: u.accountStatus, deletedAt: u.deletedAt, paid: paid.has(u.id) });
    if (b) out.set(u.id, b);
  }
  return out;
}

export type RemovalResult =
  | { ok: true; done: number; skipped: number }
  | { ok: false; reason: "none_selected" | "too_many" | "no_sender" };

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter((s) => /^[a-z0-9]{10,40}$/i.test(s)))];
}

/**
 * "Delete" the ticked accounts. A protected account (staff, test, admin, paid,
 * already deleted) is skipped even if its id was posted: the rule is checked
 * again here and in the update itself.
 */
export async function softDeleteAccounts(adminId: string, rawIds: string[], now = new Date()): Promise<RemovalResult> {
  const ids = cleanIds(rawIds);
  if (ids.length === 0) return { ok: false, reason: "none_selected" };
  if (ids.length > REMOVAL_BATCH) return { ok: false, reason: "too_many" };
  const blocked = await removalBlocks(ids);
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, kind: true, accountStatus: true, createdAt: true } });
  let done = 0;
  for (const u of users) {
    if (blocked.has(u.id) || u.id === adminId) continue;
    const { count } = await prisma.user.updateMany({
      // The status just read: a change in between makes this match nothing, so
      // deletedPrevStatus is always the status the account really had.
      where: { id: u.id, deletedAt: null, isAdmin: false, accountStatus: u.accountStatus },
      data: { deletedAt: now, deletedById: adminId, deletedPrevStatus: u.accountStatus, accountStatus: "REVOKED", sessionsValidAfter: now },
    });
    if (count !== 1) continue;
    await audit({
      actorUserId: adminId,
      action: "admin.account.delete",
      resourceType: "User",
      resourceId: u.id,
      before: { emailSha256: hashEmail(u.email), kind: u.kind, status: u.accountStatus, createdAt: u.createdAt.toISOString() },
      after: { deletedAt: now.toISOString(), purgeOn: purgeDate(now).toISOString(), restorableDays: RESTORE_DAYS },
    });
    done += 1;
  }
  return { ok: true, done, skipped: ids.length - done };
}

/** Put a deleted account back as it was (status included). */
export async function restoreAccount(adminId: string, id: string, now = new Date()): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, deletedAt: true, deletedPrevStatus: true } });
  if (!u?.deletedAt || purgeDue(u.deletedAt, now)) return false;
  const { count } = await prisma.user.updateMany({
    where: { id, deletedAt: u.deletedAt },
    data: { deletedAt: null, deletedById: null, deletedPrevStatus: null, accountStatus: u.deletedPrevStatus || "UNREVIEWED" },
  });
  if (count !== 1) return false;
  await audit({
    actorUserId: adminId,
    action: "admin.account.restore",
    resourceType: "User",
    resourceId: id,
    before: { deletedAt: u.deletedAt.toISOString() },
    after: { status: u.deletedPrevStatus || "UNREVIEWED" },
  });
  return true;
}

/**
 * "Send warning email" to the ticked accounts: "Confirm your email within 7
 * days to keep your Agental account", with a confirmation link, recorded on
 * each account (deletionWarnedAt). An account whose email is already verified
 * has nothing to confirm and is skipped, like a protected one. Refused when no
 * email sender is configured: nothing would reach anyone.
 */
export async function sendWarningEmails(adminId: string, rawIds: string[], baseUrl: string, now = new Date()): Promise<RemovalResult> {
  const ids = cleanIds(rawIds);
  if (ids.length === 0) return { ok: false, reason: "none_selected" };
  if (ids.length > REMOVAL_BATCH) return { ok: false, reason: "too_many" };
  if (!emailSenderConfigured()) return { ok: false, reason: "no_sender" };
  const blocked = await removalBlocks(ids);
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, emailVerified: null, deletedAt: null },
    select: { id: true, email: true, locale: true, deletionWarnedAt: true, accounts: { select: { provider: true } } },
  });
  let done = 0;
  for (const u of users) {
    if (blocked.has(u.id) || u.accounts.length > 0) continue; // Google/Apple accounts are verified by the provider.
    const previous = u.deletionWarnedAt;
    // Claim the row first: two admins (or two tabs) never send the same warning twice.
    const claimed = await prisma.user.updateMany({ where: { id: u.id, deletionWarnedAt: previous, deletedAt: null }, data: { deletionWarnedAt: now } });
    if (claimed.count !== 1) continue;
    const token = await createEmailToken(prisma, { purpose: "verify", userId: u.id, ttlMs: warningLinkTtlMs(WARNING_DAYS), now });
    const res = await sendEmail({
      to: u.email,
      kind: "deletion_warning",
      ...deletionWarningEmail(u.locale, linkFor("verify", token, u.locale, baseUrl), WARNING_DAYS),
    });
    if (!res.ok || res.mode !== "resend") {
      await prisma.user.updateMany({ where: { id: u.id, deletionWarnedAt: now }, data: { deletionWarnedAt: previous } });
      continue;
    }
    await audit({ actorUserId: adminId, action: "admin.account.warn", resourceType: "User", resourceId: u.id, after: { days: WARNING_DAYS } });
    done += 1;
  }
  return { ok: true, done, skipped: ids.length - done };
}

export interface DeletedRow {
  id: string;
  name: string;
  email: string;
  kind: string;
  deletedAt: Date;
  purgeOn: Date;
  deletedBy: string | null;
}

export async function listDeleted(): Promise<DeletedRow[]> {
  const users = await prisma.user.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take: 2000,
    select: { id: true, name: true, email: true, kind: true, deletedAt: true, deletedById: true, artistProfile: { select: { stageName: true } } },
  });
  const byIds = [...new Set(users.map((u) => u.deletedById).filter((v): v is string => !!v))];
  const admins = new Map(
    (await prisma.user.findMany({ where: { id: { in: byIds } }, select: { id: true, email: true } })).map((a) => [a.id, a.email])
  );
  return users.map((u) => ({
    id: u.id,
    name: u.artistProfile?.stageName || u.name || "",
    email: u.email,
    kind: u.kind,
    deletedAt: u.deletedAt!,
    purgeOn: purgeDate(u.deletedAt!),
    deletedBy: u.deletedById ? (admins.get(u.deletedById) ?? null) : null,
  }));
}

/**
 * Remove for good the accounts deleted more than 30 days ago, with their
 * files. Runs from the daily cron and whenever an admin opens Deleted, so it
 * happens even without the cron. Idempotent: a second run finds nothing.
 */
export async function purgeDeletedAccounts(now = new Date(), actorUserId: string | null = null, limit = REMOVAL_BATCH): Promise<{ purged: number; failed: number }> {
  const cutoff = new Date(now.getTime() - RESTORE_DAYS * 24 * 60 * 60 * 1000);
  const due = await prisma.user.findMany({
    where: { deletedAt: { not: null, lte: cutoff } },
    take: limit,
    select: { id: true, email: true, kind: true, createdAt: true, deletedAt: true },
  });
  if (due.length === 0) return { purged: 0, failed: 0 };
  const storage = await getStorage();
  let purged = 0;
  let failed = 0;
  for (const r of due) {
    try {
      const gone = await prisma.$transaction(async (tx) => {
        const profile = await tx.artistProfile.findUnique({
          where: { userId: r.id },
          select: { id: true, avatarKey: true, media: { select: { storageKey: true } } },
        });
        const uploads = profile ? await tx.upload.findMany({ where: { profileId: profile.id }, select: { storageKey: true } }) : [];
        // Only what the delete left: still REVOKED, never an admin (protection re-checked).
        const { count } = await tx.user.deleteMany({ where: { id: r.id, deletedAt: { not: null, lte: cutoff }, isAdmin: false, accountStatus: "REVOKED" } });
        if (count !== 1) return null;
        await tx.verificationToken.deleteMany({ where: { identifier: { in: [`verify:${r.id}`, `reset:${r.id}`] } } });
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
          console.error("[account-removal] stored object not removed, retry by key", { key, error: error instanceof Error ? error.name : "unknown" });
        });
      }
      await audit({
        actorUserId,
        action: "admin.account.purge",
        resourceType: "User",
        resourceId: r.id,
        before: { emailSha256: hashEmail(r.email), kind: r.kind, createdAt: r.createdAt.toISOString(), deletedAt: r.deletedAt!.toISOString(), files: gone.length },
        after: { purged: true },
      });
      purged += 1;
    } catch (error) {
      failed += 1;
      console.error("[account-removal] account not purged", { userId: r.id, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    }
  }
  return { purged, failed };
}
