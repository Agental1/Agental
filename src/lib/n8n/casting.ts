import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bearerMatches } from "@/lib/limelight/request";
import { agentEligibility } from "@/lib/agents";
import { searchAccess } from "@/lib/app-settings";
import { loadProfileFacts } from "@/lib/workflow/profiles";
import { startRoleSearch } from "@/lib/role-search";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { FIRST_AUTO_KEY, PERIOD_DAYS, busySlots, searchPaceFor, type SearchPace } from "@/domain/role-search";
import { PlanB2C } from "@/domain/enums";
import { workflowMode, type WorkflowMode } from "@/domain/workflow/eligibility";
import type { ProfileFacts } from "@/domain/workflow/profile";

/**
 * The link between the app and the n8n "Beta V2" casting workflow (round 7,
 * Part C). n8n calls two endpoints with `Authorization: Bearer <secret>`:
 *
 *   POST /api/n8n/casting/claim     { limit, executionId }
 *     -> { jobs: [{ requestId, profile }] }
 *   POST /api/n8n/casting/complete  { executionId, results: [...] }
 *     -> { results: [{ requestId, outcome }] }
 *
 * The queue is `role_search_requests` (Start finding roles). Claiming is
 * atomic (FOR UPDATE SKIP LOCKED) and re-checks eligibility, so a search
 * queued before staff changed an account's status is cancelled, never run.
 * A completion is accepted once, from the execution that claimed the row:
 * a retry gets the stored outcome and writes nothing twice. Results become
 * application drafts for the performer's review; nothing is submitted.
 */

export const N8N_SECRET_ENV = "N8N_SHARED_SECRET";

/** "off" when no secret is configured (the routes answer 404). */
export function n8nAuth(headers: Headers, env: Record<string, string | undefined> = process.env): "off" | "ok" | "denied" {
  const secret = (env[N8N_SECRET_ENV] ?? "").trim();
  if (secret.length < 24) return "off";
  return bearerMatches(headers, secret) ? "ok" : "denied";
}

const EXECUTION_ID = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const ClaimInput = z.object({
  limit: z.coerce.number().int().min(1).max(10).catch(10),
  executionId: EXECUTION_ID,
});

/** The profile fields the ranking reads, and nothing else. */
export interface CastingProfile {
  id: string;
  country: string | null;
  confirmed18Plus: boolean;
  city: string | null;
  travelCities: string[];
  availableDates: string[];
  unavailableDates: string[];
  availabilityIsComplete: false;
  languages: string[];
  skills: string[];
  preferredCategories: string[];
  excludedCategories: string[];
  materialsOnFile: string[];
}

export function castingProfile(f: ProfileFacts): CastingProfile {
  const countries = f.mobilityCountries.map((c) => c.toUpperCase());
  return {
    id: f.profileId,
    country: countries.includes("US") ? "US" : (countries[0] ?? null),
    confirmed18Plus: f.isAdult,
    city: f.city,
    travelCities: [],
    availableDates: [],
    unavailableDates: [],
    availabilityIsComplete: false,
    languages: f.languages.slice(0, 10),
    skills: [...new Set(f.specialties.flatMap((s) => [s.kind, ...s.tags]))].slice(0, 20),
    preferredCategories: f.preferences.projectTypes.slice(0, 10),
    excludedCategories: [],
    materialsOnFile: [],
  };
}

export interface CastingJob {
  requestId: string;
  profile: CastingProfile;
}

const SIX_HOURS = 6 * 60 * 60 * 1000;
/** The most slots any plan has: no performer needs more due rows than this in one claim. */
const MAX_SLOTS = Math.max(...PlanB2C.options.map((p) => searchPaceFor(p).slots));
/**
 * Due rows read per job asked for: headroom for rows skipped because their
 * performer has no free slot right now.
 */
const CLAIM_OVERFETCH = 10;
const SCHEDULED_PER_CLAIM = 50;
/**
 * Round 9: the most one search may cost across providers, in US dollars
 * (`SEARCH_COST_CEILING_USD`, default 0.50). Handed to n8n with each claim so
 * the workflow stops a runaway search; a completion that reports more is
 * recorded, flagged and alerted. TODO(founders) in docs/DECISIONS.md.
 */
export const DEFAULT_SEARCH_COST_CEILING_USD = 0.5;
export const CEILING_ERROR = "stopped at the cost ceiling";
export function searchCostCeilingUsd(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseFloat((env.SEARCH_COST_CEILING_USD ?? "").trim());
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : DEFAULT_SEARCH_COST_CEILING_USD;
}

/** A claim older than this never got its completion (crash, missing result). */
export const CLAIM_TTL_MS = 30 * 60 * 1000;
const TX = { timeout: 20_000, maxWait: 10_000 };

/** Casting sites the workflow searches; the only hosts a "source" link may point at. */
export const CASTING_DOMAINS = ["actorsaccess.com", "castingnetworks.com", "backstage.com", "playbill.com", "projectcasting.com"];

/**
 * Queue one search per six-hour window for performers who turned on the
 * scheduled search, under the same gate and quota as a click. The client key
 * names the window, so two claims in the same window queue nothing twice.
 */
export async function queueScheduledSearches(now: Date, mode: WorkflowMode): Promise<number> {
  const window = Math.floor(now.getTime() / SIX_HOURS);
  const where = { autoSearchOptIn: true, kind: "TALENT" };
  const total = await prisma.user.count({ where });
  // A different slice each window, so everyone gets a turn.
  const skip = total > SCHEDULED_PER_CLAIM ? (window * SCHEDULED_PER_CLAIM) % total : 0;
  const users = await prisma.user.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, skip, take: SCHEDULED_PER_CLAIM });
  let queued = 0;
  const access = await searchAccess();
  for (const u of users) {
    // Round 8b: a performer with a search already waiting gets no extra one,
    // so their own searches are not pushed back 6 hours at a time.
    if ((await prisma.roleSearchRequest.count({ where: { userId: u.id, status: "queued" } })) > 0) continue;
    // Round 9: a failed search gives its place back, so a performer whose searches
    // keep hitting the cost ceiling gets no new automatic one for a day.
    const stopped = await prisma.roleSearchRequest.count({
      where: { userId: u.id, status: "failed", error: CEILING_ERROR, completedAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
    if (stopped >= 2) continue;
    if (!(await agentEligibility(u.id, { mode, now, access })).ok) continue;
    const res = await startRoleSearch(u.id, `auto6h_${window}`, now, mode, true);
    if (res.ok && !res.duplicate) queued += 1;
  }
  return queued;
}

/**
 * Claim up to `limit` queued searches for one n8n execution. A retry of the
 * same execution gets back the rows it already holds instead of new ones.
 */
export async function claimCastingJobs(
  input: { limit: number; executionId: string },
  opts: { now?: Date; mode?: WorkflowMode } = {}
): Promise<{ jobs: CastingJob[]; canceled: number }> {
  const now = opts.now ?? new Date();
  const mode = opts.mode ?? workflowMode();
  return prisma.$transaction(async (tx) => {
    // Claims that never completed: fail them, which gives the search back.
    await tx.roleSearchRequest.updateMany({
      where: { status: "running", startedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
      data: { status: "failed", completedAt: now, error: "timed out" },
    });
    const held = await tx.roleSearchRequest.findMany({
      where: { status: "running", claimedBy: input.executionId },
      select: { id: true, userId: true, clientKey: true },
      orderBy: { createdAt: "asc" },
    });
    // Round 8d: at most MAX_SLOTS due rows per performer enter the window, so
    // one performer's backlog cannot crowd out everyone else's searches.
    const due =
      held.length > 0
        ? held
        : await tx.$queryRaw<{ id: string; userId: string; clientKey: string | null }[]>`
            SELECT id, "userId", "clientKey" FROM "public"."role_search_requests"
            WHERE id IN (
              SELECT id FROM (
                SELECT id, row_number() OVER (
                  PARTITION BY "userId" ORDER BY COALESCE("scheduledFor", "createdAt") ASC, id ASC
                ) AS rn
                FROM "public"."role_search_requests"
                WHERE status = 'queued' AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
                  -- Round 11.1: in test mode only Test accounts run; a real
                  -- performer's search stays queued (never canceled) until live.
                  -- Spam, revoked and other ineligible rows are still canceled below.
                  AND (${mode === "live"}::boolean OR "userId" NOT IN (SELECT id FROM "public"."User" WHERE "accountStatus" IN ('UNREVIEWED', 'APPROVED')))
              ) ranked
              WHERE rn <= ${MAX_SLOTS}
            )
            AND status = 'queued'
            ORDER BY COALESCE("scheduledFor", "createdAt") ASC, id ASC
            LIMIT ${input.limit * CLAIM_OVERFETCH}
            FOR UPDATE SKIP LOCKED`;
    // Round 8d: each performer runs at most their CURRENT plan's slots at once,
    // and a slot starts one search per gap (B2C_PLANS searchSlots,
    // searchSpacingHours). Round 8b's "one every 6 hours" is the one-slot case.
    const free = new Map<string, number>();
    if (held.length === 0 && due.length > 0) {
      const users = [...new Set(due.map((r) => r.userId))].sort();
      // The same per-performer lock as a click (startRoleSearch): two claims
      // running at once count each other's starts. Sorted, so no deadlock.
      for (const u of users) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"role-search:" + u}))`;
      const maxGap = Math.max(...PlanB2C.options.map((p) => searchPaceFor(p).spacingMs));
      const active = await tx.roleSearchRequest.findMany({
        where: {
          userId: { in: users },
          OR: [{ status: "running" }, { startedAt: { gt: new Date(now.getTime() - maxGap) } }],
        },
        select: { userId: true, status: true, startedAt: true },
      });
      for (const u of users) {
        const { plan } = await getTalentPlan(u, now, tx);
        const pace: SearchPace = searchPaceFor(plan);
        free.set(u, Math.max(0, pace.slots - busySlots(active.filter((a) => a.userId === u), now, pace)));
      }
    }
    const rows: typeof due = [];
    for (const r of due) {
      if (held.length > 0) {
        rows.push(r);
        continue;
      }
      if (rows.length >= input.limit) break;
      const left = free.get(r.userId) ?? 0;
      if (left <= 0) continue;
      free.set(r.userId, left - 1);
      rows.push(r);
    }
    const jobs: CastingJob[] = [];
    let canceled = 0;
    for (const row of rows) {
      const profile = await tx.artistProfile.findUnique({ where: { userId: row.userId }, select: { id: true } });
      // The first automatic search is its own consent record (it stamps no click).
      const firstAuto = row.clientKey === FIRST_AUTO_KEY;
      const loaded = profile ? await loadProfileFacts(tx, [profile.id], now, mode, { firstAuto }) : { profiles: [] };
      const facts = loaded.profiles[0];
      if (!facts && firstAuto) {
        // Round 10: a first automatic search keeps its place (its key is unique,
        // so a canceled one could never start again); it runs once eligible.
        continue;
      }
      if (!facts) {
        // Not eligible any more (status, email, age or opt-in): never run.
        await tx.roleSearchRequest.update({
          where: { id: row.id },
          data: { status: "canceled", completedAt: now, error: "ineligible at claim", claimedBy: input.executionId },
        });
        canceled += 1;
        continue;
      }
      if (held.length === 0) {
        await tx.roleSearchRequest.update({
          where: { id: row.id },
          data: { status: "running", startedAt: now, claimedBy: input.executionId },
        });
        // Round 11.1: a search uses the allowance when it starts, in the period
        // it starts in: a search that waited past its period opens a new one.
        await tx.$executeRaw`UPDATE "public"."User" SET "searchPeriodStartedAt" = ${now}
          WHERE id = ${row.userId} AND ("searchPeriodStartedAt" IS NULL OR "searchPeriodStartedAt" <= ${new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000)})`;
      }
      jobs.push({ requestId: row.id, profile: castingProfile(facts) });
    }
    return { jobs, canceled };
  }, TX);
}

// ------------------------------------------------------------- completion

const text = (max: number) => z.string().trim().max(max);
const httpsUrl = z
  .string()
  .trim()
  .max(1200)
  .refine((v) => {
    try {
      const u = new URL(v);
      const host = u.hostname.toLowerCase();
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        CASTING_DOMAINS.some((d) => host === d || host.endsWith("." + d))
      );
    } catch {
      return false;
    }
  });

/** One ranked role as the workflow returns it. Model output: every field is checked. */
export const RankedRole = z.object({
  rank: z.number().int().min(1).max(50),
  roleKey: text(400).min(1),
  project: text(200).min(1),
  role: text(200).min(1),
  sourceUrl: httpsUrl,
  city: text(120).nullish(),
  remote: z.boolean().nullish(),
  deadline: text(40).nullish(),
  category: text(80).nullish(),
  score: z.number().min(0).max(1000).nullish(),
  reasons: z.array(text(200)).max(10).catch([]),
  review: z.array(text(300)).max(20).catch([]),
  draft: z
    .object({ subject: text(300), body: text(4000), route: text(80).nullish() })
    .nullish(),
  /**
   * Round 9: the full description for "Get more details". All optional: a
   * listing that does not say is shown without it.
   */
  production: text(200).nullish(),
  description: text(6000).nullish(),
  startsOn: text(40).nullish(),
  endsOn: text(40).nullish(),
  pay: z
    .object({
      paid: z.boolean().nullish(),
      rateUsd: z.number().min(0).max(1_000_000).nullish(),
      text: text(200).nullish(),
    })
    .nullish()
    .catch(null),
  union: text(80).nullish(),
  /** What the role asks applicants to send (round 7b): questions and videos. */
  submission: z
    .object({
      // One bad item never empties the list: bad items are dropped, the rest kept.
      questions: z.array(z.unknown()).catch([]).transform((a) => a.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().slice(0, 500)] : [])).slice(0, 10)),
      videos: z.array(z.unknown()).catch([]).transform((a) => a.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim().slice(0, 200)] : [])).slice(0, 5)),
    })
    .nullish(),
});
export type RankedRole = z.infer<typeof RankedRole>;

/** Round 9: what the search cost, per provider, as the workflow measured it. */
export const UsageInput = z.object({
  provider: z.enum(["openai", "perplexity", "anthropic"]),
  model: text(80).nullish(),
  // Out-of-range values are capped, never zeroed: a runaway must still show and alert.
  inputTokens: z.number().int().min(0).catch(0).transform((v) => Math.min(v, 50_000_000)),
  outputTokens: z.number().int().min(0).catch(0).transform((v) => Math.min(v, 50_000_000)),
  requests: z.number().int().min(0).catch(0).transform((v) => Math.min(v, 10_000)),
  costUsd: z.number().min(0).catch(0).transform((v) => Math.min(v, 100)),
});

const ResultInput = z.object({
  requestId: z.string().trim().min(1).max(64),
  status: text(60).min(1),
  roles: z.array(z.unknown()).catch([]).transform((a) => a.slice(0, 8)),
  // One bad entry never drops the others; at most one row per provider is kept.
  usage: z
    .array(z.unknown())
    .catch([])
    .transform((a) => a.flatMap((u) => {
      const p = UsageInput.safeParse(u);
      return p.success ? [p.data] : [];
    }).slice(0, 6)),
});

export const CompleteInput = z.object({
  executionId: EXECUTION_ID,
  results: z.array(ResultInput).max(10),
});

export type CompleteOutcome =
  | "done"
  | "no_matches"
  | "canceled"
  | "failed"
  | "already_recorded"
  | "not_claimed"
  | "unknown_request";

const dedupe = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

export async function completeCastingJobs(
  input: z.infer<typeof CompleteInput>,
  opts: { now?: Date } = {}
): Promise<{ results: { requestId: string; outcome: CompleteOutcome; drafts?: number }[] }> {
  const now = opts.now ?? new Date();
  const out: { requestId: string; outcome: CompleteOutcome; drafts?: number }[] = [];
  for (const r of input.results) {
    out.push(await completeOne(r, input.executionId, now));
  }
  return { results: out };
}

async function completeOne(
  r: z.infer<typeof ResultInput>,
  executionId: string,
  now: Date
): Promise<{ requestId: string; outcome: CompleteOutcome; drafts?: number }> {
  const requestId = r.requestId;
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; userId: string; status: string; claimedBy: string | null }[]>`
      SELECT id, "userId", status, "claimedBy" FROM "public"."role_search_requests"
      WHERE id = ${requestId} FOR UPDATE`;
    if (!row) return { requestId, outcome: "unknown_request" as const };
    // Round 9: what this search cost, whatever its outcome (a failed or timed-out
    // search still spent), from the execution that claimed it. One row per
    // provider: a retry never counts twice.
    const spent = row.claimedBy === executionId ? await recordUsage(tx, requestId, r.usage) : { costMicroUsd: 0, requests: 0 };
    const ceilingMicro = Math.round(searchCostCeilingUsd() * 1_000_000);
    if (spent.costMicroUsd > ceilingMicro) await flagOverCeiling(tx, requestId, spent.costMicroUsd, ceilingMicro, now);
    if (["done", "failed", "canceled"].includes(row.status)) return { requestId, outcome: "already_recorded" as const };
    if (row.status !== "running" || row.claimedBy !== executionId) return { requestId, outcome: "not_claimed" as const };
    if (r.status === "cost_ceiling") {
      await tx.roleSearchRequest.update({
        where: { id: requestId },
        data: { status: "failed", completedAt: now, error: CEILING_ERROR },
      });
      return { requestId, outcome: "failed" as const };
    }

    if (r.status === "ineligible_pilot") {
      await tx.roleSearchRequest.update({
        where: { id: requestId },
        data: { status: "canceled", completedAt: now, error: "ineligible for the pilot" },
      });
      return { requestId, outcome: "canceled" as const };
    }
    if (r.status !== "completed" && r.status !== "no_verified_matches") {
      await tx.roleSearchRequest.update({
        where: { id: requestId },
        data: { status: "failed", completedAt: now, error: r.status.replace(/[^a-z0-9_ -]/gi, "").slice(0, 80) || "failed" },
      });
      return { requestId, outcome: "failed" as const };
    }

    const roles = r.roles.flatMap((raw) => {
      const p = RankedRole.safeParse(raw);
      return p.success ? [p.data] : [];
    });
    const profile = await tx.artistProfile.findUnique({ where: { userId: row.userId }, select: { id: true } });
    if (!profile) {
      await tx.roleSearchRequest.update({ where: { id: requestId }, data: { status: "failed", completedAt: now, error: "no profile" } });
      return { requestId, outcome: "failed" as const };
    }
    let drafts = 0;
    {
      for (const role of roles) {
        const dedupeKey = `n8n:${dedupe(role.sourceUrl + "|" + role.roleKey)}`;
        // ON CONFLICT DO NOTHING: two completions for the same role cannot
        // abort each other. The shared brief keeps no performer's draft.
        const { draft: _personal, ...listing } = role;
        void _personal;
        await tx.brief.createMany({
          data: [
            {
              source: "n8n-beta-v2",
              sourceRef: role.sourceUrl,
              dedupeKey,
              title: role.project,
              roleName: role.role,
              location: role.city ?? null,
              remote: role.remote ?? null,
              production: role.production ?? null,
              description: role.description ?? "",
              startsOn: dayOrNull(role.startsOn),
              endsOn: dayOrNull(role.endsOn),
              paid: role.pay?.paid ?? (role.pay?.rateUsd ? true : null),
              rateCents: role.pay?.rateUsd != null ? Math.round(role.pay.rateUsd * 100) : null,
              unionStatus: role.union ?? null,
              raw: JSON.stringify(listing).slice(0, 20000),
              submission: JSON.stringify(role.submission ?? {}),
            },
          ],
          skipDuplicates: true,
        });
        const brief = await tx.brief.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } });
        // Round 9: a role first seen without its description gets it once.
        if (role.description) {
          await tx.brief.updateMany({ where: { id: brief.id, description: "" }, data: { description: role.description } });
        }
        // A role first seen without its questions and videos gets them, once,
        // and only while nobody has accepted it (they never change under someone).
        if (role.submission && (role.submission.questions.length > 0 || role.submission.videos.length > 0)) {
          await tx.brief.updateMany({
            where: { id: brief.id, submission: "{}", drafts: { none: { status: { in: ["ACCEPTED", "SUBMITTED"] } } } },
            data: { submission: JSON.stringify(role.submission) },
          });
        }
        const note = role.draft ? `${role.draft.subject}\n\n${role.draft.body}` : null;
        const existing = await tx.applicationDraft.findUnique({
          where: { profileId_briefId: { profileId: profile.id, briefId: brief.id } },
          select: { id: true },
        });
        if (!existing) {
          // A draft the performer reviews. Nothing is sent or submitted.
          await tx.applicationDraft.create({
            data: {
              profileId: profile.id,
              briefId: brief.id,
              status: "DRAFT",
              note,
              idempotencyKey: `n8n:${requestId}:${brief.id}`,
            },
          });
          drafts += 1;
        }
      }
    }
    await tx.workflowRun.create({
      data: {
        kind: "casting.search",
        idempotencyKey: `casting:${requestId}`,
        status: "SUCCEEDED",
        attempts: 1,
        modelCalls: spent.requests,
        costMicroUsd: spent.costMicroUsd,
        subjectRef: requestId,
        result: JSON.stringify({
          status: r.status,
          roles: roles.map((x) => ({ rank: x.rank, project: x.project, role: x.role, sourceUrl: x.sourceUrl, score: x.score ?? null })),
        }),
        startedAt: now,
        finishedAt: now,
      },
    });
    await tx.roleSearchRequest.update({ where: { id: requestId }, data: { status: "done", completedAt: now } });
    return { requestId, outcome: roles.length ? ("done" as const) : ("no_matches" as const), drafts };
  }, TX);
}

/** "2026-12-01" (or a full ISO date) as a date at midnight UTC; anything else null. */
function dayOrNull(v: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  // "2026-02-31" would roll over to March: refused.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? null : d;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Store the usage once per provider (a retried completion changes nothing) and return the total. */
async function recordUsage(tx: Tx, requestId: string, usage: z.infer<typeof UsageInput>[]): Promise<{ costMicroUsd: number; requests: number }> {
  if (usage.length > 0) {
    await tx.aiUsage.createMany({
      data: usage.map((u) => ({
        provider: u.provider,
        kind: "casting.search",
        ref: requestId,
        model: u.model ?? null,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        requests: u.requests,
        costMicroUsd: Math.round(u.costUsd * 1_000_000),
      })),
      skipDuplicates: true,
    });
  }
  const rows = await tx.aiUsage.findMany({ where: { kind: "casting.search", ref: requestId }, select: { costMicroUsd: true, requests: true } });
  // Clamped to a 32-bit integer (WorkflowRun columns): a total can never abort the write.
  const INT_MAX = 2_147_483_647;
  return {
    costMicroUsd: Math.min(INT_MAX, rows.reduce((a, r) => a + r.costMicroUsd, 0)),
    requests: Math.min(INT_MAX, rows.reduce((a, r) => a + r.requests, 0)),
  };
}

/** A search that cost more than the ceiling: one alert to the admins' bell, once per search. */
async function flagOverCeiling(tx: Tx, requestId: string, costMicro: number, ceilingMicro: number, now: Date): Promise<void> {
  const admins = await tx.user.findMany({ where: { isAdmin: true, deletedAt: null }, select: { id: true } });
  const dollars = (m: number) => `$${(m / 1_000_000).toFixed(2)}`;
  const title = `AI search over its cost ceiling (${dollars(costMicro)} > ${dollars(ceilingMicro)})`;
  const already = await tx.notification.count({ where: { kind: "ALERT", payload: { contains: `"search":"${requestId}"` } } });
  if (already > 0) return;
  await tx.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      kind: "ALERT",
      title,
      body: `Search ${requestId} reported ${dollars(costMicro)}. Check the workflow's limits in Admin > Applications and AI jobs.`,
      link: "/admin/recherches",
      payload: JSON.stringify({ search: requestId, costMicroUsd: costMicro, at: now.toISOString() }),
    })),
  });
}
