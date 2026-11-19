import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import type { sendEmail } from "@/lib/mailer";
import {
  BRIEF_STATUSES,
  BriefInput,
  issuePaths,
  type BriefStatus,
  type NormalizedBrief,
} from "@/domain/workflow/brief";
import { evaluateConstraints, missingFields, RULE_VERSION } from "@/domain/workflow/constraints";
import type { Decision, FitNote } from "@/domain/workflow/fit";
import { inputHashFor } from "@/domain/workflow/input-hash";
import {
  createModelBudget,
  resolveLimits,
  RUN_STALE_MS,
  type WorkflowLimits,
} from "@/domain/workflow/limits";
import { briefFromRow, normalizeBrief, sha256Hex } from "@/domain/workflow/normalize";
import type { ProfileFacts } from "@/domain/workflow/profile";
import { alertDeadRun } from "./alerts";
import { pilotProfileIds, selectProfileIds, type WorkflowEnv } from "./config";
import { evaluateFit, type EvaluateContext, type ItemEvaluation } from "./evaluate";
import type { FitModel } from "./model";
import { loadProfileFacts } from "./profiles";
import { workflowMode } from "@/domain/workflow/eligibility";

/**
 * The run engine of the brief intake.
 *
 * One request is one WorkflowRun, found by its idempotency key:
 *
 *   PENDING ─▶ RUNNING ─▶ SUCCEEDED
 *                 │
 *                 ├─▶ FAILED ─▶ RUNNING (the same request, sent again)
 *                 └─▶ DEAD   (attempts used up: logged and alerted)
 *
 * A run does three things and nothing else: it stores briefs, it writes fit
 * evaluations, and it creates draft rows for a performer to look at. It
 * sends nothing, submits nothing and calls nothing except the model adapter
 * it was handed.
 *
 * Every step can be repeated safely. Briefs are found by dedupe key,
 * evaluations by (brief, profile, input hash), drafts by (profile, brief).
 * A request sent twice returns the stored result and writes nothing. A run
 * that failed halfway keeps what it had stored and picks up from there.
 */

export const INTAKE_KIND = "brief_intake";

type IntakeDb = PrismaClient;

export interface IntakeInput {
  source: string;
  /** The `briefs` array of the request, not yet validated one by one. */
  briefs: unknown[];
  profileIds?: string[];
  /** Identity of the request: from the Idempotency-Key header, or the body hash. */
  idempotencyKey: string;
  /** sha256 of the raw body, to catch a key reused for another request. */
  bodyHash: string;
}

export interface IntakeDeps {
  db: IntakeDb;
  /** Null for rules only. The route passes the result of getFitModel(). */
  model: FitModel | null;
  env?: WorkflowEnv;
  now?: () => Date;
  sendEmail?: typeof sendEmail;
}

const BriefOutcome = z.object({
  /** Position in the request's `briefs` array. */
  index: z.number().int(),
  briefId: z.string().nullable(),
  result: z.enum(["created", "duplicate", "invalid"]),
  /** Status of the stored brief. Null for an invalid one. */
  status: z.enum(BRIEF_STATUSES).nullable(),
  /** For an invalid brief: the paths of the refused fields. */
  issues: z.array(z.string()).optional(),
});
export type BriefOutcome = z.infer<typeof BriefOutcome>;

const count = z.number().int().min(0);

const IntakeSummary = z.object({
  briefs: z.object({ created: count, duplicate: count, invalid: count, expired: count }),
  profiles: z.object({ evaluated: count, skipped: count }),
  evaluations: z.object({
    /** Rows written by this attempt. */
    created: count,
    /** Assessments that already existed for the same inputs. */
    reused: count,
    eligible: count,
    needs_review: count,
    ineligible: count,
  }),
  drafts: z.object({ created: count, existing: count }),
  model: z.object({
    version: z.string().nullable(),
    calls: count,
    costMicroUsd: count,
    /** Items decided on rules alone although a model was wanted, by reason. */
    fallbacks: z.record(z.string(), count),
    /** Limits that stopped work in this run. */
    limitsHit: z.array(z.string()),
  }),
  ruleVersion: z.string(),
  /** Schema fields the rules would need and that do not exist yet. */
  missingFields: z.array(z.string()),
});
export type IntakeSummary = z.infer<typeof IntakeSummary>;

const StoredResult = z.object({
  v: z.literal(1),
  request: z.object({ bodyHash: z.string(), source: z.string(), briefCount: count }),
  /** Null until the briefs have been stored. */
  briefs: z.array(BriefOutcome).nullable(),
  summary: IntakeSummary,
});
type StoredResult = z.infer<typeof StoredResult>;

export interface IntakeResultBody {
  runId: string;
  status: "SUCCEEDED" | "FAILED" | "DEAD";
  /** True when this answer is the stored result of an earlier request. */
  replayed: boolean;
  attempts: number;
  briefs: BriefOutcome[];
  summary: IntakeSummary;
}

export type IntakeOutcome =
  | { kind: "done"; body: IntakeResultBody }
  /** The attempt failed and the same request may be sent again. */
  | { kind: "failed"; body: IntakeResultBody }
  /** The run used up its attempts. Sending it again changes nothing. */
  | { kind: "dead"; body: IntakeResultBody }
  /** Another request is working on this run right now. */
  | { kind: "busy"; runId: string }
  /** The idempotency key was used before for a different body. */
  | { kind: "mismatch" };

function emptySummary(modelVersion: string | null): IntakeSummary {
  return {
    briefs: { created: 0, duplicate: 0, invalid: 0, expired: 0 },
    profiles: { evaluated: 0, skipped: 0 },
    evaluations: { created: 0, reused: 0, eligible: 0, needs_review: 0, ineligible: 0 },
    drafts: { created: 0, existing: 0 },
    model: { version: modelVersion, calls: 0, costMicroUsd: 0, fallbacks: {}, limitsHit: [] },
    ruleVersion: RULE_VERSION,
    missingFields: [],
  };
}

function readStored(raw: string): StoredResult | null {
  try {
    const parsed = StoredResult.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * What is kept of a failure: where it happened, the error's class and, when
 * it has one, its short code. The message is left out: a database or SDK message
 * can quote the row or the request, and with them a person or a brief.
 */
export function redactError(stage: string, error: unknown): string {
  const plain = (value: string) => value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60);
  const name = error instanceof Error ? plain(error.constructor.name) : "";
  const code = (error as { code?: unknown } | null)?.code;
  const parts = [plain(stage) || "run", name || "Error"];
  if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,19}$/.test(code)) parts.push(code);
  return parts.join(":");
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function body(
  run: { id: string; attempts: number },
  status: IntakeResultBody["status"],
  stored: StoredResult,
  replayed: boolean
): IntakeResultBody {
  return {
    runId: run.id,
    status,
    replayed,
    attempts: run.attempts,
    briefs: stored.briefs ?? [],
    summary: stored.summary,
  };
}

/* ── Step 1: store the briefs ──────────────────────────────────────────── */

interface ValidBrief {
  index: number;
  brief: NormalizedBrief;
  raw: string;
}

/**
 * Validate, normalize and store the briefs of one request, in one
 * transaction with the run's checkpoint: either every new brief is stored
 * and the outcomes are recorded on the run, or nothing is.
 */
async function storeBriefs(
  db: IntakeDb,
  runId: string,
  input: IntakeInput,
  stored: StoredResult,
  now: Date
): Promise<BriefOutcome[]> {
  const outcomes: BriefOutcome[] = [];
  const valid: ValidBrief[] = [];
  input.briefs.forEach((item, index) => {
    const parsed = BriefInput.safeParse(item);
    if (!parsed.success) {
      outcomes.push({
        index,
        briefId: null,
        result: "invalid",
        status: null,
        issues: issuePaths(parsed.error),
      });
      return;
    }
    valid.push({
      index,
      brief: normalizeBrief(input.source, parsed.data, now),
      raw: JSON.stringify(item),
    });
  });

  const keys = [...new Set(valid.map((item) => item.brief.dedupeKey))];

  const rows = await db.$transaction(
    async (tx) => {
      const existing =
        keys.length > 0
          ? await tx.brief.findMany({
              where: { dedupeKey: { in: keys } },
              select: { dedupeKey: true },
            })
          : [];
      const known = new Set(existing.map((row) => row.dedupeKey));

      // The first occurrence of a new key is created. A second one in the
      // same request is a duplicate of the first.
      const createdKeys = new Set<string>();
      const toCreate = valid.filter((item) => {
        const key = item.brief.dedupeKey;
        if (known.has(key) || createdKeys.has(key)) return false;
        createdKeys.add(key);
        return true;
      });
      if (toCreate.length > 0) {
        await tx.brief.createMany({
          data: toCreate.map(({ brief, raw }) => ({
            source: brief.source,
            sourceRef: brief.sourceRef,
            dedupeKey: brief.dedupeKey,
            title: brief.title,
            production: brief.production,
            roleName: brief.roleName,
            roleType: brief.roleType,
            description: brief.description,
            location: brief.location,
            country: brief.country,
            remote: brief.remote,
            startsOn: brief.startsOn,
            endsOn: brief.endsOn,
            paid: brief.paid,
            rateCents: brief.rateCents,
            unionStatus: brief.unionStatus,
            requirements: JSON.stringify(brief.requirements),
            expiresAt: brief.expiresAt,
            status: brief.status,
            raw,
            receivedAt: now,
          })),
        });
      }

      if (keys.length > 0) {
        // A stored brief whose closing time has passed is closed for good.
        await tx.brief.updateMany({
          where: { dedupeKey: { in: keys }, status: "ACTIVE", expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        });
      }
      const current =
        keys.length > 0
          ? await tx.brief.findMany({
              where: { dedupeKey: { in: keys } },
              select: { id: true, dedupeKey: true, status: true },
            })
          : [];
      const byKey = new Map(current.map((row) => [row.dedupeKey, row]));

      const firstCreated = new Set(toCreate.map((item) => item.index));
      for (const item of valid) {
        const row = byKey.get(item.brief.dedupeKey);
        if (!row) throw new Error("brief row missing after insert");
        const status = (BRIEF_STATUSES as readonly string[]).includes(row.status)
          ? (row.status as BriefStatus)
          : "WITHDRAWN";
        outcomes.push({
          index: item.index,
          briefId: row.id,
          result: firstCreated.has(item.index) ? "created" : "duplicate",
          status,
        });
      }
      outcomes.sort((a, b) => a.index - b.index);

      const summary = stored.summary;
      summary.briefs = {
        created: outcomes.filter((o) => o.result === "created").length,
        duplicate: outcomes.filter((o) => o.result === "duplicate").length,
        invalid: outcomes.filter((o) => o.result === "invalid").length,
        expired: outcomes.filter((o) => o.result !== "invalid" && o.status === "EXPIRED").length,
      };
      const checkpoint: StoredResult = { ...stored, briefs: outcomes, summary };
      await tx.workflowRun.update({
        where: { id: runId },
        data: { result: JSON.stringify(checkpoint) },
      });
      return outcomes;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );
  return rows;
}

/* ── Step 2 and 3: evaluate, then make sure a draft exists ─────────────── */

const pairKey = (briefId: string, profileId: string) => `${briefId}\n${profileId}`;

function evaluationData(briefId: string, profileId: string, item: ItemEvaluation) {
  return {
    briefId,
    profileId,
    decision: item.decision,
    rulesPassed: JSON.stringify(item.rulesPassed),
    ruleFailures: JSON.stringify(item.ruleFailures),
    unknowns: JSON.stringify(item.unknowns),
    reasons: JSON.stringify(item.reasons),
    profileEvidence: JSON.stringify(item.profileEvidence),
    briefEvidence: JSON.stringify(item.briefEvidence),
    ruleVersion: item.ruleVersion,
    modelVersion: item.modelVersion,
    inputHash: item.inputHash,
  };
}

const OPERATOR_NOTES: ReadonlySet<FitNote> = new Set<FitNote>([
  "limit:model_calls_per_run",
  "limit:cost_per_run",
  "limit:cost_per_day",
  "input_too_large",
  "model_timeout",
  "model_error",
  "model_refused",
  "model_invalid_output",
  "invented_evidence",
  "model_contradiction",
]);

async function evaluateAndDraft(
  db: IntakeDb,
  runId: string,
  briefIds: string[],
  profiles: ProfileFacts[],
  ctx: EvaluateContext,
  summary: IntakeSummary
): Promise<void> {
  if (briefIds.length === 0 || profiles.length === 0) return;
  const profileIds = profiles.map((profile) => profile.profileId);

  const briefRows = await db.brief.findMany({ where: { id: { in: briefIds } } });
  const briefs = new Map(briefRows.map((row) => [row.id, briefFromRow(row)]));

  const knownEvaluations = await db.fitEvaluation.findMany({
    where: { briefId: { in: briefIds }, profileId: { in: profileIds } },
    select: { id: true, briefId: true, profileId: true, inputHash: true, decision: true },
  });
  const evaluations = new Map(
    knownEvaluations.map((row) => [`${pairKey(row.briefId, row.profileId)}\n${row.inputHash}`, row])
  );

  const knownDrafts = await db.applicationDraft.findMany({
    where: { briefId: { in: briefIds }, profileId: { in: profileIds } },
    select: { id: true, briefId: true, profileId: true, status: true, evaluationId: true },
  });
  const drafts = new Map(knownDrafts.map((row) => [pairKey(row.briefId, row.profileId), row]));

  const missing = new Set(summary.missingFields);
  const wantedModelVersion = ctx.model ? ctx.model.version : null;

  for (const briefId of briefIds) {
    const brief = briefs.get(briefId);
    // Closed between the two steps, or gone: nothing to assess. A brief
    // whose closing time has passed is never assessed, whatever its row says.
    if (!brief || brief.status !== "ACTIVE") continue;
    if (brief.expiresAt && brief.expiresAt.getTime() <= ctx.now.getTime()) continue;

    for (const profile of profiles) {
      const pair = pairKey(briefId, profile.profileId);
      const wanted = inputHashFor(brief, profile, RULE_VERSION, wantedModelVersion, ctx.now);
      let row = evaluations.get(`${pair}\n${wanted}`);
      let fresh = false;

      if (!row) {
        const item = await evaluateFit(brief, profile, ctx);
        if (item.modelCalls > 0) {
          // Spend is recorded before the result, so a crash cannot hide it.
          await db.workflowRun.update({
            where: { id: runId },
            data: {
              modelCalls: { increment: item.modelCalls },
              costMicroUsd: { increment: item.costMicroUsd },
            },
          });
        }
        for (const note of item.notes) {
          if (OPERATOR_NOTES.has(note)) {
            summary.model.fallbacks[note] = (summary.model.fallbacks[note] ?? 0) + 1;
          }
        }
        // When the model could not be used, the result is a rules-only one
        // and may already be stored under the rules-only hash.
        row = evaluations.get(`${pair}\n${item.inputHash}`);
        if (!row) {
          const data = evaluationData(briefId, profile.profileId, item);
          try {
            row = await db.fitEvaluation.create({
              data,
              select: { id: true, briefId: true, profileId: true, inputHash: true, decision: true },
            });
            fresh = true;
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
            row = await db.fitEvaluation.findUniqueOrThrow({
              where: {
                briefId_profileId_inputHash: {
                  briefId,
                  profileId: profile.profileId,
                  inputHash: item.inputHash,
                },
              },
              select: { id: true, briefId: true, profileId: true, inputHash: true, decision: true },
            });
          }
          evaluations.set(`${pair}\n${row.inputHash}`, row);
        }
      }

      if (fresh) summary.evaluations.created += 1;
      else summary.evaluations.reused += 1;
      const decision = row.decision as Decision;
      if (decision === "eligible" || decision === "needs_review" || decision === "ineligible") {
        summary.evaluations[decision] += 1;
      }
      for (const field of missingFields(evaluateConstraints(brief, profile, ctx.now).rules)) {
        missing.add(field);
      }

      const draft = drafts.get(pair);
      if (!draft) {
        if (decision !== "eligible" && decision !== "needs_review") continue;
        try {
          const created = await db.applicationDraft.create({
            data: {
              profileId: profile.profileId,
              briefId,
              evaluationId: row.id,
              status: "DRAFT",
              idempotencyKey: `draft:${sha256Hex(pair)}`,
            },
            select: { id: true, briefId: true, profileId: true, status: true, evaluationId: true },
          });
          drafts.set(pair, created);
          summary.drafts.created += 1;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          summary.drafts.existing += 1;
        }
        continue;
      }

      summary.drafts.existing += 1;
      // An unreviewed draft follows the newest assessment. A reviewed one,
      // or one waiting for information, is left exactly as the performer
      // left it.
      const repoint =
        draft.status === "DRAFT" &&
        draft.evaluationId !== row.id &&
        (fresh || draft.evaluationId === null);
      if (repoint) {
        await db.applicationDraft.updateMany({
          where: { id: draft.id, status: "DRAFT" },
          data: { evaluationId: row.id },
        });
        draft.evaluationId = row.id;
      }
    }
  }

  summary.missingFields = [...missing];
}

/* ── The run ───────────────────────────────────────────────────────────── */

export async function runBriefIntake(
  input: IntakeInput,
  deps: IntakeDeps
): Promise<IntakeOutcome> {
  const { db, model } = deps;
  const env = deps.env ?? process.env;
  const clock = deps.now ?? (() => new Date());
  const limits: WorkflowLimits = resolveLimits(env);
  const now = clock();
  const modelVersion = model ? model.version : null;

  // Find the run of this request, or open it.
  let run = await db.workflowRun.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!run) {
    const fresh: StoredResult = {
      v: 1,
      request: {
        bodyHash: input.bodyHash,
        source: input.source,
        briefCount: input.briefs.length,
      },
      briefs: null,
      summary: emptySummary(modelVersion),
    };
    try {
      run = await db.workflowRun.create({
        data: {
          kind: INTAKE_KIND,
          idempotencyKey: input.idempotencyKey,
          status: "PENDING",
          maxAttempts: limits.maxRunAttempts,
          result: JSON.stringify(fresh),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      run = await db.workflowRun.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });
    }
  }

  const stored = readStored(run.result);
  if (run.kind !== INTAKE_KIND || !stored || stored.request.bodyHash !== input.bodyHash) {
    return { kind: "mismatch" };
  }
  if (run.status === "SUCCEEDED") return { kind: "done", body: body(run, "SUCCEEDED", stored, true) };
  if (run.status === "DEAD") return { kind: "dead", body: body(run, "DEAD", stored, true) };

  if (run.status === "RUNNING") {
    const since = (run.startedAt ?? run.updatedAt).getTime();
    if (now.getTime() - since <= RUN_STALE_MS) return { kind: "busy", runId: run.id };
    // Otherwise the attempt that held it is gone, and this request takes over.
  }

  if (run.attempts >= run.maxAttempts) {
    await db.workflowRun.updateMany({
      where: { id: run.id, status: run.status, attempts: run.attempts },
      data: { status: "DEAD", finishedAt: now, lastError: "run:AttemptsExhausted" },
    });
    await alertDeadRun(run, { env, sendEmail: deps.sendEmail });
    return { kind: "dead", body: body(run, "DEAD", stored, true) };
  }

  // Claim it. Two requests racing for the same run cannot both win: the
  // update only applies to the row as it was just read.
  const claimed = await db.workflowRun.updateMany({
    where: { id: run.id, status: run.status, attempts: run.attempts },
    data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: now, finishedAt: null },
  });
  if (claimed.count !== 1) return { kind: "busy", runId: run.id };
  const attempt = { id: run.id, attempts: run.attempts + 1 };

  const progress: StoredResult = {
    ...stored,
    // What an earlier attempt assessed is found again in the database, so
    // the counts of this step start over.
    summary: { ...emptySummary(modelVersion), briefs: stored.summary.briefs },
  };
  let stage = "briefs";

  try {
    if (!progress.briefs) {
      progress.briefs = await storeBriefs(db, run.id, input, progress, now);
    }

    stage = "profiles";
    const selected = selectProfileIds(pilotProfileIds(env), input.profileIds);
    const limited = selected.slice(0, limits.maxProfilesPerRun);
    const { profiles, skipped } = await loadProfileFacts(db, limited, now, workflowMode(env));
    progress.summary.profiles = { evaluated: profiles.length, skipped };
    const limitsHit: string[] = [];
    if (selected.length > limited.length) limitsHit.push("profiles_per_run");

    stage = "budget";
    const spent = await db.workflowRun.aggregate({
      where: { createdAt: { gte: startOfUtcDay(now) }, id: { not: run.id } },
      _sum: { costMicroUsd: true },
    });
    const budget = createModelBudget(limits, {
      spentTodayMicroUsd: spent._sum.costMicroUsd ?? 0,
      priorModelCalls: run.modelCalls,
      priorCostMicroUsd: run.costMicroUsd,
    });

    stage = "evaluate";
    const evaluable = [
      ...new Set(
        progress.briefs
          .filter((outcome) => outcome.briefId !== null && outcome.status === "ACTIVE")
          .map((outcome) => outcome.briefId as string)
      ),
    ];
    try {
      await evaluateAndDraft(
        db,
        run.id,
        evaluable,
        profiles,
        { model, limits, budget, now },
        progress.summary
      );
    } finally {
      progress.summary.model.calls = budget.modelCalls;
      progress.summary.model.costMicroUsd = budget.costMicroUsd;
      progress.summary.model.limitsHit = [...limitsHit, ...budget.limitsHit];
    }

    stage = "finish";
    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: clock(),
        lastError: null,
        result: JSON.stringify(progress),
      },
    });
    // Counts and ids only. Best effort: the run has already succeeded.
    await audit(
      {
        action: "workflow.intake",
        resourceType: "WorkflowRun",
        resourceId: run.id,
        after: {
          source: input.source,
          briefs: progress.summary.briefs,
          evaluations: progress.summary.evaluations,
          drafts: progress.summary.drafts,
        },
      },
      db
    ).catch(() => {
      console.error(`[workflow] audit entry not written ${run.id}`);
    });
    return { kind: "done", body: body(attempt, "SUCCEEDED", progress, false) };
  } catch (error) {
    const dead = attempt.attempts >= run.maxAttempts;
    const lastError = redactError(stage, error);
    try {
      await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          lastError,
          finishedAt: dead ? clock() : null,
          result: JSON.stringify(progress),
        },
      });
    } catch {
      // The database itself is failing. The run stays RUNNING and a later
      // request takes it over once it is stale.
    }
    if (dead) {
      await alertDeadRun({ id: run.id, kind: run.kind }, { env, sendEmail: deps.sendEmail });
      return { kind: "dead", body: body(attempt, "DEAD", progress, false) };
    }
    console.error(`[workflow] run failed ${run.id} ${lastError}`);
    return { kind: "failed", body: body(attempt, "FAILED", progress, false) };
  }
}
