import { prisma } from "@/lib/db";
import { agentEligibility } from "@/lib/agents";
import type { IneligibleReason, WorkflowMode } from "@/domain/workflow/eligibility";
import { getTalentPlan } from "@/lib/billing/entitlement";
import {
  COUNTED_STATUSES,
  IN_PROGRESS_STATUSES,
  allowanceFor,
  periodActive,
  periodKeyFor,
  quotaFrom,
  isAutoKey,
  nextSearchStart,
  type RoleSearchQuota,
} from "@/domain/role-search";
import { B2C_PLANS } from "@/domain/pricing";

/**
 * AI role searches, server side. The quota is checked and the row written in
 * the same transaction, under a per-user advisory lock, so double clicks and
 * parallel tabs cannot go over the limit. The unique index on
 * (userId, periodKey, seq) is the last guard if the lock were ever skipped.
 *
 * Nothing here calls a workflow: rows wait in status "queued" for n8n.
 *
 * Round 7: no row is written for an account that may not trigger an agent
 * (src/domain/workflow/eligibility.ts): verified email, adult, status
 * APPROVED in live (TEST in staging). The click is the opt-in and is stamped.
 */

export async function getRoleSearchQuota(userId: string, now = new Date()): Promise<RoleSearchQuota> {
  const { plan } = await getTalentPlan(userId, now);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { searchPeriodStartedAt: true } });
  const start = user?.searchPeriodStartedAt ?? null;
  const used = periodActive(start, now)
    ? await prisma.roleSearchRequest.count({
        where: { userId, periodKey: periodKeyFor(start), status: { in: [...COUNTED_STATUSES] } },
      })
    : 0;
  return quotaFrom(plan, used, start, now);
}

export type StartRoleSearchResult =
  | { ok: true; id: string; quota: RoleSearchQuota; duplicate: boolean }
  | { ok: false; reason: "quota_exhausted"; quota: RoleSearchQuota }
  | { ok: false; reason: "auto_exhausted"; quota: RoleSearchQuota }
  | { ok: false; reason: "ineligible"; why: IneligibleReason; quota: RoleSearchQuota };

export async function startRoleSearch(
  userId: string,
  clientKey: string,
  now = new Date(),
  mode?: WorkflowMode,
  /**
   * false: a click (the click is the opt-in and is stamped).
   * true: a six-hour scheduled search (needs the existing opt-in, stamps nothing).
   * "first": the first automatic search (owner decision, round 7b): allowed as
   * itself, stamps no opt-in, and sits outside the automatic cap.
   */
  scheduled: boolean | "first" = false
): Promise<StartRoleSearchResult> {
  const { plan } = await getTalentPlan(userId, now);
  const allowance = allowanceFor(plan);

  return prisma.$transaction(async (tx) => {
    // One click at a time per performer. Released at commit or rollback.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"role-search:" + userId}))`;

    // The period: the stored start while it runs, else a new one begins now.
    const u = await tx.user.findUnique({ where: { id: userId }, select: { searchPeriodStartedAt: true } });
    const stored = u?.searchPeriodStartedAt ?? null;
    const active = periodActive(stored, now);
    const start = active ? stored : now;
    const periodKey = periodKeyFor(start);

    // The same click sent twice (retry, double submit): answer with the row.
    const existing = await tx.roleSearchRequest.findUnique({
      where: { userId_clientKey: { userId, clientKey } },
      select: { id: true },
    });
    const counted = await tx.roleSearchRequest.findMany({
      where: { userId, periodKey, status: { in: [...COUNTED_STATUSES] } },
      select: { seq: true, clientKey: true },
    });
    // The gate, before anything is queued or a retried click is answered.
    // Checked under the lock, so a status changed by staff a moment earlier
    // is the one that counts.
    const eligible = await agentEligibility(userId, { clicking: scheduled !== true, mode, db: tx, now });
    if (!eligible.ok) {
      return {
        ok: false as const,
        reason: "ineligible" as const,
        why: eligible.reason,
        quota: quotaFrom(plan, counted.length, active ? start : null, now),
      };
    }
    if (existing) {
      return { ok: true as const, id: existing.id, duplicate: true, quota: quotaFrom(plan, counted.length, start, now) };
    }
    if (counted.length >= allowance.count) {
      return { ok: false as const, reason: "quota_exhausted" as const, quota: quotaFrom(plan, counted.length, start, now) };
    }
    // Searches the server starts on its own have their own monthly cap,
    // inside the allowance (B2C_PLANS[plan].autoSearches).
    if (scheduled === true && isAutoKey(clientKey)) {
      // Scheduled searches share the plan's automatic cap; the first automatic
      // search is counted in it too, but never refused by it.
      const auto = counted.filter((r) => isAutoKey(r.clientKey)).length;
      const cap = B2C_PLANS[plan].autoSearches;
      if (cap !== null && auto >= cap) {
        return { ok: false as const, reason: "auto_exhausted" as const, quota: quotaFrom(plan, counted.length, start, now) };
      }
    }
    // The count above decides the quota (a failed search gives its place
    // back); seq only has to be unused, so it is the smallest free number.
    const all = await tx.roleSearchRequest.findMany({
      where: { userId, periodKey },
      select: { seq: true },
    });
    const used = new Set(all.map((r) => r.seq));
    let seq = 1;
    while (used.has(seq)) seq++;

    if (!active) {
      await tx.user.update({ where: { id: userId }, data: { searchPeriodStartedAt: now } });
    }
    if (scheduled === false) {
      await tx.user.updateMany({ where: { id: userId, agentsOptInAt: null }, data: { agentsOptInAt: now } });
    }
    // One search every 6 hours (round 8b): after the latest one, whatever its state.
    const latest = await tx.roleSearchRequest.findMany({
      where: { userId, status: { in: [...COUNTED_STATUSES] } },
      select: { scheduledFor: true, startedAt: true, createdAt: true },
    });
    const latestStart = latest.reduce<Date | null>((acc, r) => {
      // The later of the planned and the real start (a late claim pushes the next one).
      const planned = r.scheduledFor ?? r.createdAt;
      const at = r.startedAt && r.startedAt > planned ? r.startedAt : planned;
      return !acc || at > acc ? at : acc;
    }, null);
    const scheduledFor = nextSearchStart(latestStart, now);
    const row = await tx.roleSearchRequest.create({
      data: { userId, plan, periodKey, seq, clientKey, status: "queued", scheduledFor },
      select: { id: true },
    });
    return { ok: true as const, id: row.id, duplicate: false, quota: quotaFrom(plan, counted.length + 1, start, now) };
  });
}

/** A performer's own searches, newest first. */
export function listMyRoleSearches(userId: string, take = 20) {
  return prisma.roleSearchRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, status: true, createdAt: true, scheduledFor: true, startedAt: true, completedAt: true },
  });
}

export function listMyRoleSearchesInProgress(userId: string) {
  return prisma.roleSearchRequest.findMany({
    where: { userId, status: { in: [...IN_PROGRESS_STATUSES] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true },
  });
}

/** Every search, for admins. The caller checks isAdmin. */
export function listAllRoleSearches(take = 200) {
  return prisma.roleSearchRequest.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      plan: true,
      periodKey: true,
      seq: true,
      status: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      error: true,
      user: { select: { id: true, email: true } },
    },
  });
}

/** The counts in the dashboard's Status block (round 8b). */
export interface MySearchStatus {
  queued: number;
  running: number;
  finished: number;
  rolesFound: number;
}

/**
 * A performer's searches by state, and the roles the searches found (drafts
 * from the role-search workflow). Failed and canceled searches are not shown.
 */
export async function getMySearchStatus(userId: string): Promise<MySearchStatus> {
  const [byStatus, rolesFound] = await Promise.all([
    prisma.roleSearchRequest.groupBy({
      by: ["status"],
      where: { userId, status: { in: ["queued", "running", "done"] } },
      _count: { _all: true },
    }),
    prisma.applicationDraft.count({
      where: { profile: { userId }, brief: { source: "n8n-beta-v2" } },
    }),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  return { queued: n("queued"), running: n("running"), finished: n("done"), rolesFound };
}
