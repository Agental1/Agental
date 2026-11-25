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
  searchPaceFor,
  type RoleSearchQuota,
} from "@/domain/role-search";
import { B2C_PLANS } from "@/domain/pricing";
import { workflowMode as currentMode } from "@/domain/workflow/eligibility";
import { effectiveStatus } from "@/domain/account-model";
import { searchesRunning } from "@/lib/app-settings";

/**
 * AI role searches, server side. The quota is checked and the row written in
 * the same transaction, under a per-user advisory lock, so double clicks and
 * parallel tabs cannot go over the limit. The unique index on
 * (userId, periodKey, seq) is the last guard if the lock were ever skipped.
 *
 * Nothing here calls a workflow: rows wait in status "queued" for n8n.
 * Round 8d: a plan runs several searches at once (B2C_PLANS searchSlots).
 *
 * Round 7: no row is written for an account that may not trigger an agent
 * (src/domain/workflow/eligibility.ts): verified email, adult, status
 * APPROVED in live (TEST in staging). The click is the opt-in and is stamped.
 */

export async function getRoleSearchQuota(userId: string, now = new Date()): Promise<RoleSearchQuota> {
  const { plan } = await getTalentPlan(userId, now);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { searchPeriodStartedAt: true, searchQuotaResetAt: true },
  });
  const start = user?.searchPeriodStartedAt ?? null;
  const active = periodActive(start, now);
  const { used, held } = await heldSearches(prisma, userId, active ? start : null, user?.searchQuotaResetAt);
  return quotaFrom(plan, used, start, now, held.length);
}

type Db = Pick<typeof prisma, "roleSearchRequest">;

/**
 * Round 11.1 (founder): a search uses the allowance only once it starts, in the
 * period it starts in (`used`: running or done, started since the period
 * began). `held` is what the performer holds now: every queued and running
 * search plus the ones used this period; a click is refused once it reaches
 * the allowance. A queued search that never ran used nothing when the period
 * resets, but still holds its place. Rows from before a staff quota reset
 * count nowhere. Legacy rows without a start time use their creation time.
 */
export async function heldSearches(
  db: Db,
  userId: string,
  periodStart: Date | null,
  resetAt: Date | null | undefined
): Promise<{ used: number; held: { clientKey: string | null; startedAt: Date | null; createdAt: Date }[] }> {
  const startedThisPeriod = periodStart
    ? [
        { status: { in: ["running", "done"] }, startedAt: { gte: periodStart } },
        { status: { in: ["running", "done"] }, startedAt: null, createdAt: { gte: periodStart } },
      ]
    : [];
  const rows = await db.roleSearchRequest.findMany({
    where: { userId, ...sinceReset(resetAt), OR: [{ status: { in: [...IN_PROGRESS_STATUSES] } }, ...startedThisPeriod] },
    select: { clientKey: true, status: true, startedAt: true, createdAt: true },
  });
  const used = periodStart
    ? rows.filter((r) => r.status !== "queued" && (r.startedAt ?? r.createdAt) >= periodStart).length
    : 0;
  return { used, held: rows };
}

/** How many recent searches the schedule reads at least (it needs `slots` of them). */
const RECENT_STARTS_FLOOR = 50;

/** Round 8d: rows from before the account's quota reset do not count. */
const sinceReset = (resetAt: Date | null | undefined) => (resetAt ? { createdAt: { gte: resetAt } } : {});

export type StartRoleSearchResult =
  | { ok: true; id: string; quota: RoleSearchQuota; duplicate: boolean; scheduledFor?: Date }
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
    const u = await tx.user.findUnique({
      where: { id: userId },
      select: { searchPeriodStartedAt: true, searchQuotaResetAt: true },
    });
    const stored = u?.searchPeriodStartedAt ?? null;
    const active = periodActive(stored, now);
    const start = active ? stored : now;
    const periodKey = periodKeyFor(start);

    // The same click sent twice (retry, double submit): answer with the row.
    const existing = await tx.roleSearchRequest.findUnique({
      where: { userId_clientKey: { userId, clientKey } },
      select: { id: true },
    });
    // Round 11.1: held = queued + running + started this period (heldSearches).
    const { used: usedNow, held: counted } = await heldSearches(tx, userId, active ? start : null, u?.searchQuotaResetAt);
    // The gate, before anything is queued or a retried click is answered.
    // Checked under the lock, so a status changed by staff a moment earlier
    // is the one that counts.
    const eligible = await agentEligibility(userId, { clicking: scheduled !== true, mode, db: tx, now });
    if (!eligible.ok) {
      return {
        ok: false as const,
        reason: "ineligible" as const,
        why: eligible.reason,
        quota: quotaFrom(plan, usedNow, active ? start : null, now, counted.length),
      };
    }
    if (existing) {
      return { ok: true as const, id: existing.id, duplicate: true, quota: quotaFrom(plan, usedNow, start, now, counted.length) };
    }
    if (counted.length >= allowance.count) {
      return { ok: false as const, reason: "quota_exhausted" as const, quota: quotaFrom(plan, usedNow, start, now, counted.length) };
    }
    // Searches the server starts on its own have their own monthly cap,
    // inside the allowance (B2C_PLANS[plan].autoSearches).
    if (scheduled === true && isAutoKey(clientKey)) {
      // Scheduled searches share the plan's automatic cap; the first automatic
      // search is counted in it too, but never refused by it.
      // Round 11.1: this period's automatic searches only (queued or started in it).
      const auto = active
        ? counted.filter((r) => isAutoKey(r.clientKey) && (r.startedAt ?? r.createdAt) >= start).length
        : 0;
      const cap = B2C_PLANS[plan].autoSearches;
      if (cap !== null && auto >= cap) {
        return { ok: false as const, reason: "auto_exhausted" as const, quota: quotaFrom(plan, usedNow, start, now, counted.length) };
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
    // Round 8d: the plan's parallel slots, each starting one search every
    // 6 hours (round 8b's rule with one slot). Searches from before a quota
    // reset still hold their slot while they wait or run.
    const pace = searchPaceFor(plan);
    const recent = await tx.roleSearchRequest.findMany({
      where: { userId, status: { in: [...COUNTED_STATUSES] } },
      orderBy: [{ createdAt: "desc" }],
      // nextSearchStart needs the `slots` most recent starts; read well past that.
      take: Math.max(RECENT_STARTS_FLOOR, pace.slots * 5),
      select: { scheduledFor: true, startedAt: true, createdAt: true },
    });
    // The later of the planned and the real start (a late claim pushes the next one).
    const starts = recent.map((r) => {
      const planned = r.scheduledFor ?? r.createdAt;
      return r.startedAt && r.startedAt > planned ? r.startedAt : planned;
    });
    const scheduledFor = nextSearchStart(starts, now, pace);
    const row = await tx.roleSearchRequest.create({
      data: { userId, plan, periodKey, seq, clientKey, status: "queued", scheduledFor },
      select: { id: true },
    });
    return { ok: true as const, id: row.id, duplicate: false, scheduledFor, quota: quotaFrom(plan, usedNow, start, now, counted.length + 1) };
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

/** The counts in the dashboard's Status block (round 8b, slots in round 8d). */
export interface MySearchStatus {
  queued: number;
  running: number;
  finished: number;
  rolesFound: number;
  /** The plan's parallel slots ("1 of 2 running"). */
  slots: number;
  /** When the next queued search is expected to start (ISO), when still ahead; else null. */
  nextStart: string | null;
  /** Round 11.1: queued searches cannot start yet (no start time is shown). */
  waiting: boolean;
}

/**
 * Round 11.1: will this performer's queued searches start? Only while "Run
 * searches" is on, and only for an account that runs in the current mode
 * (Test accounts in test mode, real ones in live), the claim's own rule.
 */
export async function searchesWillStart(userId: string, mode: WorkflowMode = currentMode()): Promise<boolean> {
  if (!(await searchesRunning())) return false;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { kind: true, isStaff: true, isAdmin: true, accountStatus: true },
  });
  if (!u) return false;
  const status = effectiveStatus(u);
  return mode === "live" ? status === "UNREVIEWED" || status === "APPROVED" : status === "TEST";
}

/**
 * A performer's searches by state, and the roles the searches found (drafts
 * from the role-search workflow). Failed and canceled searches are not shown.
 */
export async function getMySearchStatus(userId: string, now = new Date()): Promise<MySearchStatus> {
  const [byStatus, rolesFound, { plan }, next, starts] = await Promise.all([
    prisma.roleSearchRequest.groupBy({
      by: ["status"],
      where: { userId, status: { in: ["queued", "running", "done"] } },
      _count: { _all: true },
    }),
    prisma.applicationDraft.count({
      where: { profile: { userId }, brief: { source: "n8n-beta-v2" } },
    }),
    getTalentPlan(userId, now),
    prisma.roleSearchRequest.findFirst({
      // The next start still ahead; due searches are simply "in queue".
      where: { userId, status: "queued", scheduledFor: { gt: now } },
      orderBy: [{ scheduledFor: "asc" }],
      select: { scheduledFor: true },
    }),
    searchesWillStart(userId),
  ]);
  const n = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  return {
    queued: n("queued"),
    running: n("running"),
    finished: n("done"),
    rolesFound,
    slots: searchPaceFor(plan).slots,
    // No start time or estimate while searches cannot start.
    nextStart: starts && next?.scheduledFor ? next.scheduledFor.toISOString() : null,
    waiting: !starts,
  };
}
