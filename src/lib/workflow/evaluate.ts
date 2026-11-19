import { BriefInput, issuePaths, type NormalizedBrief } from "@/domain/workflow/brief";
import { evaluateConstraints, missingFields, RULE_VERSION } from "@/domain/workflow/constraints";
import {
  buildFitInput,
  combineFit,
  inventedEvidence,
  parseModelOutput,
  recordFields,
  type Decision,
  type FallbackReason,
  type FitResult,
  type ModelAnswer,
} from "@/domain/workflow/fit";
import { inputHashFor } from "@/domain/workflow/input-hash";
import {
  createModelBudget,
  limitsWith,
  MAX_MODEL_INPUT_CHARS,
  type LimitReason,
  type ModelBudget,
  type WorkflowLimits,
} from "@/domain/workflow/limits";
import { normalizeBrief } from "@/domain/workflow/normalize";
import type { ProfileFacts } from "@/domain/workflow/profile";
import { FIT_SYSTEM_INSTRUCTION, fitUserMessage } from "@/domain/workflow/prompt";
import type { FitModel, FitModelResponse } from "./model";

/**
 * The assessment of one brief for one performer, and the same over a list.
 *
 * This file stays away from the database, so it runs on in-memory fixtures: the
 * run engine (./intake) and a calibration script call the same function.
 *
 * Order of work for one item:
 *   1. The deterministic rules. A failure ends it: the model is not asked.
 *   2. If a model is given and the budget allows a call, the model, under a
 *      timeout. A malformed answer is retried within the per-item limit.
 *   3. The answer is validated and combined with the rules (combineFit).
 * Whenever step 2 yields nothing usable, the rules' result stands and the
 * reason is noted.
 */

export interface EvaluateContext {
  /** Null for the rules-only path. */
  model: FitModel | null;
  limits: Pick<WorkflowLimits, "maxRetriesPerItem" | "modelTimeoutMs">;
  /** Shared by every item of a run. */
  budget: ModelBudget;
  now: Date;
}

export interface ItemEvaluation extends FitResult {
  /** The model whose answer was read, or null when the rules decided alone. */
  modelVersion: string | null;
  inputHash: string;
  /** Model calls made for this item, retries included. */
  modelCalls: number;
  /** What those calls cost, in micro-USD. */
  costMicroUsd: number;
}

type CallOutcome =
  | { kind: "response"; response: FitModelResponse }
  | { kind: "timeout" }
  | { kind: "error" };

/** One model call that cannot outlive `timeoutMs`. */
async function callModel(
  model: FitModel,
  user: string,
  timeoutMs: number
): Promise<CallOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CallOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });
  const call = Promise.resolve()
    .then(() =>
      model.assess({
        system: FIT_SYSTEM_INSTRUCTION,
        user,
        signal: controller.signal,
        timeoutMs,
      })
    )
    .then((response): CallOutcome => ({ kind: "response", response }))
    // The cause is not kept: an SDK error can quote the request back.
    .catch((): CallOutcome => ({ kind: "error" }));
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluateFit(
  brief: NormalizedBrief,
  profile: ProfileFacts,
  ctx: EvaluateContext
): Promise<ItemEvaluation> {
  const rules = evaluateConstraints(brief, profile, ctx.now);
  const model = ctx.model;
  const costBefore = ctx.budget.costMicroUsd;
  let modelCalls = 0;
  let answer: ModelAnswer = { kind: "none" };

  if (model && rules.decision !== "ineligible") {
    const input = buildFitInput(brief, profile, rules);
    const user = fitUserMessage(input);
    let reason: FallbackReason = "model_error";
    let usable: ModelAnswer | null = null;

    if (user.length > MAX_MODEL_INPUT_CHARS) {
      reason = "input_too_large";
    } else {
      const reserve = model.maxCostPerCallMicroUsd;
      const maxCalls = 1 + Math.max(0, ctx.limits.maxRetriesPerItem);
      for (let call = 0; call < maxCalls; call++) {
        const allowed = ctx.budget.check(reserve);
        if (!allowed.ok) {
          reason = `limit:${allowed.reason}`;
          break;
        }
        const outcome = await callModel(model, user, ctx.limits.modelTimeoutMs);
        modelCalls += 1;
        if (outcome.kind === "timeout") {
          // What an abandoned call cost is unknown, so the worst case is charged.
          ctx.budget.record(reserve);
          reason = "model_timeout";
          continue;
        }
        if (outcome.kind === "error") {
          ctx.budget.record(0);
          reason = "model_error";
          continue;
        }
        const cost = outcome.response.costMicroUsd;
        ctx.budget.record(Number.isFinite(cost) && cost >= 0 ? cost : reserve);
        if (outcome.response.refused) {
          reason = "model_refused";
          break;
        }
        const parsed = parseModelOutput(outcome.response.text);
        if (!parsed.ok) {
          reason = "model_invalid_output";
          continue;
        }
        usable = {
          kind: "answer",
          output: parsed.output,
          invented: inventedEvidence(parsed.output, input),
        };
        break;
      }
    }
    answer = usable ?? { kind: "fallback", reason };
  }

  const result = combineFit(rules, answer, recordFields(brief, profile));
  const modelVersion = result.modelUsed && model ? model.version : null;
  return {
    ...result,
    modelVersion,
    inputHash: inputHashFor(brief, profile, rules.ruleVersion, modelVersion, ctx.now),
    modelCalls,
    costMicroUsd: ctx.budget.costMicroUsd - costBefore,
  };
}

/* ── Calibration: a list of briefs for one profile, with no HTTP and no DB ── */

export interface CalibrationOptions {
  /** Leave out, or pass null, for the rules-only baseline. */
  model?: FitModel | null;
  /** Overrides of the default limits, inside the same hard ceilings. */
  limits?: Partial<WorkflowLimits>;
  /** Defaults to the current time. Pin it for a repeatable run. */
  now?: Date;
  /** The source the briefs are attributed to. Defaults to "fixture". */
  source?: string;
  /** Model spend already made today, counted against the daily cap. */
  spentTodayMicroUsd?: number;
}

export interface CalibrationItem {
  /** Position in the list given. */
  index: number;
  /**
   * evaluated: assessed. expired: closed, never assessed. duplicate: same
   * dedupe key as an earlier item of the list. invalid: refused by the schema.
   */
  status: "evaluated" | "expired" | "duplicate" | "invalid";
  dedupeKey: string | null;
  title: string | null;
  /** For an invalid item: the paths of the fields that were refused. */
  issues: string[];
  decision: Decision | null;
  reasons: string[];
  /** The full assessment, null unless status is "evaluated". */
  evaluation: ItemEvaluation | null;
}

export interface CalibrationResult {
  ruleVersion: string;
  /** The model given, whether or not every item reached it. */
  modelVersion: string | null;
  items: CalibrationItem[];
  counts: {
    eligible: number;
    needs_review: number;
    ineligible: number;
    expired: number;
    duplicate: number;
    invalid: number;
  };
  modelCalls: number;
  costMicroUsd: number;
  /** Limits that stopped the model from being consulted. */
  limitsHit: LimitReason[];
  /** Schema fields the rules would need and that do not exist yet. */
  missingFields: string[];
}

/**
 * Assess a list of briefs for one profile, in memory.
 *
 * `briefs` takes the same objects as the `briefs` array of the intake
 * request. Call it once with no model for the rules-only baseline and once
 * with a model for the full path, then compare item by item: both results
 * keep the order of the list.
 */
export async function evaluateBriefsForProfile(
  briefs: unknown[],
  profile: ProfileFacts,
  options: CalibrationOptions = {}
): Promise<CalibrationResult> {
  const now = options.now ?? new Date();
  const model = options.model ?? null;
  const limits = limitsWith(options.limits);
  const budget = createModelBudget(limits, {
    spentTodayMicroUsd: options.spentTodayMicroUsd,
  });
  const ctx: EvaluateContext = { model, limits, budget, now };
  const source = options.source ?? "fixture";

  const items: CalibrationItem[] = [];
  const seen = new Set<string>();
  const missing = new Set<string>();
  const counts = {
    eligible: 0,
    needs_review: 0,
    ineligible: 0,
    expired: 0,
    duplicate: 0,
    invalid: 0,
  };

  for (let index = 0; index < briefs.length; index++) {
    const parsed = BriefInput.safeParse(briefs[index]);
    if (!parsed.success) {
      counts.invalid += 1;
      items.push({
        index,
        status: "invalid",
        dedupeKey: null,
        title: null,
        issues: issuePaths(parsed.error),
        decision: null,
        reasons: [],
        evaluation: null,
      });
      continue;
    }
    const brief = normalizeBrief(source, parsed.data, now);
    const base = { index, dedupeKey: brief.dedupeKey, title: brief.title, issues: [] };
    if (seen.has(brief.dedupeKey)) {
      counts.duplicate += 1;
      items.push({ ...base, status: "duplicate", decision: null, reasons: [], evaluation: null });
      continue;
    }
    seen.add(brief.dedupeKey);
    if (brief.status !== "ACTIVE") {
      counts.expired += 1;
      items.push({ ...base, status: "expired", decision: null, reasons: [], evaluation: null });
      continue;
    }
    const evaluation = await evaluateFit(brief, profile, ctx);
    counts[evaluation.decision] += 1;
    for (const field of missingFields(evaluateConstraints(brief, profile, now).rules)) {
      missing.add(field);
    }
    items.push({
      ...base,
      status: "evaluated",
      decision: evaluation.decision,
      reasons: evaluation.reasons,
      evaluation,
    });
  }

  return {
    ruleVersion: RULE_VERSION,
    modelVersion: model ? model.version : null,
    items,
    counts,
    modelCalls: budget.modelCalls,
    costMicroUsd: budget.costMicroUsd,
    limitsHit: budget.limitsHit,
    missingFields: [...missing],
  };
}
