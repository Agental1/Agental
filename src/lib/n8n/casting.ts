import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { bearerMatches } from "@/lib/limelight/request";
import { agentEligibility } from "@/lib/agents";
import { loadProfileFacts } from "@/lib/workflow/profiles";
import { startRoleSearch } from "@/lib/role-search";
import { FIRST_AUTO_KEY } from "@/domain/role-search";
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
const SCHEDULED_PER_CLAIM = 50;
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
  for (const u of users) {
    // Round 8b: a performer with a search already waiting gets no extra one,
    // so their own searches are not pushed back 6 hours at a time.
    if ((await prisma.roleSearchRequest.count({ where: { userId: u.id, status: "queued" } })) > 0) continue;
    if (!(await agentEligibility(u.id, { mode, now })).ok) continue;
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
    const rows =
      held.length > 0
        ? held
        : await tx.$queryRaw<{ id: string; userId: string; clientKey: string | null }[]>`
            SELECT id, "userId", "clientKey" FROM "public"."role_search_requests"
            WHERE status = 'queued'
              AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
              -- Round 8b: one every 6 hours per performer, even after a backlog.
              AND NOT EXISTS (
                SELECT 1 FROM "public"."role_search_requests" r2
                WHERE r2."userId" = "role_search_requests"."userId"
                  AND (r2.status = 'running' OR r2."startedAt" > ${new Date(now.getTime() - SIX_HOURS)})
              )
            ORDER BY COALESCE("scheduledFor", "createdAt") ASC
            LIMIT ${input.limit}
            FOR UPDATE SKIP LOCKED`;
    const jobs: CastingJob[] = [];
    let canceled = 0;
    // Round 8b: at most one new search per performer in one claim.
    const seen = new Set<string>();
    for (const row of rows) {
      if (held.length === 0) {
        if (seen.has(row.userId)) continue;
        seen.add(row.userId);
      }
      const profile = await tx.artistProfile.findUnique({ where: { userId: row.userId }, select: { id: true } });
      // The first automatic search is its own consent record (it stamps no click).
      const firstAuto = row.clientKey === FIRST_AUTO_KEY;
      const loaded = profile ? await loadProfileFacts(tx, [profile.id], now, mode, { firstAuto }) : { profiles: [] };
      const facts = loaded.profiles[0];
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

const ResultInput = z.object({
  requestId: z.string().trim().min(1).max(64),
  status: text(60).min(1),
  roles: z.array(z.unknown()).catch([]).transform((a) => a.slice(0, 8)),
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
    if (["done", "failed", "canceled"].includes(row.status)) return { requestId, outcome: "already_recorded" as const };
    if (row.status !== "running" || row.claimedBy !== executionId) return { requestId, outcome: "not_claimed" as const };

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
              raw: JSON.stringify(listing).slice(0, 20000),
              submission: JSON.stringify(role.submission ?? {}),
            },
          ],
          skipDuplicates: true,
        });
        const brief = await tx.brief.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } });
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
