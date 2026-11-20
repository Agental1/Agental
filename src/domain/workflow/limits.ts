/**
 * Limits of the dry-run workflow. Every number that bounds work, time or
 * money lives here, so the engine never carries a constant of its own.
 *
 * Each limit has a default, a floor and a hard ceiling. An environment
 * variable may move a limit between the floor and the ceiling and nowhere
 * else: a typo such as an extra zero is clamped, and a value that does not
 * parse falls back to the default.
 *
 * Money is counted in micro-USD (one millionth of a dollar), as integers.
 */

/** Largest request body the intake route reads, in bytes. */
export const MAX_BODY_BYTES = 256 * 1024;

/** A signed request is refused when its timestamp is further away than this. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Largest model input, in characters. A longer record is assessed on rules only. */
export const MAX_MODEL_INPUT_CHARS = 24_000;

/** A run still marked RUNNING after this long is treated as abandoned. */
export const RUN_STALE_MS = 10 * 60 * 1000;

/** Window of the intake rate limit. */
export const INTAKE_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface WorkflowLimits {
  /** Briefs accepted in one intake request. */
  maxBriefsPerRequest: number;
  /** Pilot profiles evaluated in one run. */
  maxProfilesPerRun: number;
  /** Model calls in one run, retries included. */
  maxModelCallsPerRun: number;
  /** Extra model calls for one item after its first call. */
  maxRetriesPerItem: number;
  /** Time allowed for one model call, in milliseconds. */
  modelTimeoutMs: number;
  /** Model spend allowed in one run, in micro-USD. */
  maxCostPerRunMicroUsd: number;
  /** Model spend allowed per UTC day across all runs, in micro-USD. */
  maxCostPerDayMicroUsd: number;
  /** Attempts before a run is marked DEAD. */
  maxRunAttempts: number;
  /** Intake requests accepted per source and per hour. */
  maxRequestsPerHour: number;
}

interface LimitSpec {
  env: string;
  fallback: number;
  min: number;
  ceiling: number;
}

/** Default, floor and ceiling of each limit, with the variable that moves it. */
export const LIMIT_SPECS: Record<keyof WorkflowLimits, LimitSpec> = {
  maxBriefsPerRequest: {
    env: "WORKFLOW_MAX_BRIEFS_PER_REQUEST",
    fallback: 50,
    min: 1,
    ceiling: 50,
  },
  maxProfilesPerRun: {
    env: "WORKFLOW_MAX_PROFILES_PER_RUN",
    fallback: 10,
    min: 1,
    ceiling: 50,
  },
  maxModelCallsPerRun: {
    env: "WORKFLOW_MAX_MODEL_CALLS_PER_RUN",
    fallback: 25,
    min: 0,
    ceiling: 200,
  },
  maxRetriesPerItem: {
    env: "WORKFLOW_MAX_RETRIES_PER_ITEM",
    fallback: 1,
    min: 0,
    ceiling: 3,
  },
  modelTimeoutMs: {
    env: "WORKFLOW_MODEL_TIMEOUT_MS",
    fallback: 20_000,
    min: 1_000,
    ceiling: 60_000,
  },
  maxCostPerRunMicroUsd: {
    env: "WORKFLOW_MAX_COST_PER_RUN_MICROUSD",
    fallback: 1_000_000,
    min: 0,
    ceiling: 10_000_000,
  },
  maxCostPerDayMicroUsd: {
    env: "WORKFLOW_MAX_COST_PER_DAY_MICROUSD",
    fallback: 5_000_000,
    min: 0,
    ceiling: 50_000_000,
  },
  maxRunAttempts: {
    env: "WORKFLOW_MAX_RUN_ATTEMPTS",
    fallback: 3,
    min: 1,
    ceiling: 5,
  },
  maxRequestsPerHour: {
    env: "WORKFLOW_MAX_REQUESTS_PER_HOUR",
    fallback: 120,
    min: 1,
    ceiling: 600,
  },
};

/** The largest number of briefs any configuration accepts in one request. */
export const HARD_MAX_BRIEFS_PER_REQUEST = LIMIT_SPECS.maxBriefsPerRequest.ceiling;

export type LimitsEnv = Record<string, string | undefined>;

function resolveOne(spec: LimitSpec, raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!/^\d{1,12}$/.test(text)) return spec.fallback;
  const value = Number(text);
  return Math.min(spec.ceiling, Math.max(spec.min, value));
}

/**
 * The limits in force. Unset, empty or unreadable variables give the default;
 * a readable value is clamped between the floor and the ceiling.
 */
export function resolveLimits(env: LimitsEnv = {}): WorkflowLimits {
  const out = {} as WorkflowLimits;
  for (const key of Object.keys(LIMIT_SPECS) as Array<keyof WorkflowLimits>) {
    out[key] = resolveOne(LIMIT_SPECS[key], env[LIMIT_SPECS[key].env]);
  }
  return out;
}

/**
 * Defaults with explicit overrides, for callers that hold numbers instead of
 * an environment (a calibration script, a test). The same floors and
 * ceilings apply.
 */
export function limitsWith(overrides: Partial<WorkflowLimits> = {}): WorkflowLimits {
  const out = resolveLimits({});
  for (const key of Object.keys(LIMIT_SPECS) as Array<keyof WorkflowLimits>) {
    const value = overrides[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const spec = LIMIT_SPECS[key];
    out[key] = Math.min(spec.ceiling, Math.max(spec.min, Math.floor(value)));
  }
  return out;
}

/** Why the model stopped being consulted in a run. */
export type LimitReason =
  | "model_calls_per_run"
  | "cost_per_run"
  | "cost_per_day";

export interface ModelBudget {
  /**
   * May one more call be made? `reserveMicroUsd` is the most that call can
   * cost: the call is allowed only when even that worst case stays inside
   * both spend caps.
   */
  check(reserveMicroUsd: number): { ok: true } | { ok: false; reason: LimitReason };
  /** Count one call that was made, with what it cost. */
  record(costMicroUsd: number): void;
  /** Calls made in this run, earlier attempts included. */
  readonly modelCalls: number;
  /** Spend of this run, earlier attempts included, in micro-USD. */
  readonly costMicroUsd: number;
  /** Every limit that refused a call, each listed once, in order met. */
  readonly limitsHit: LimitReason[];
}

export interface BudgetStart {
  /** Spend of other runs since the start of the UTC day, in micro-USD. */
  spentTodayMicroUsd?: number;
  /** Calls already made by this run in an earlier attempt. */
  priorModelCalls?: number;
  /** Spend already made by this run in an earlier attempt, in micro-USD. */
  priorCostMicroUsd?: number;
}

function wholeMicroUsd(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : 0;
}

/**
 * The model budget of one run. Pure bookkeeping: it performs no call and
 * reads no clock, so the caps are tested without a model.
 */
export function createModelBudget(
  limits: Pick<
    WorkflowLimits,
    "maxModelCallsPerRun" | "maxCostPerRunMicroUsd" | "maxCostPerDayMicroUsd"
  >,
  start: BudgetStart = {}
): ModelBudget {
  const spentElsewhereToday = wholeMicroUsd(start.spentTodayMicroUsd);
  let calls = Math.max(0, Math.floor(start.priorModelCalls ?? 0));
  let cost = wholeMicroUsd(start.priorCostMicroUsd);
  const hit: LimitReason[] = [];

  const refuse = (reason: LimitReason) => {
    if (!hit.includes(reason)) hit.push(reason);
    return { ok: false as const, reason };
  };

  return {
    check(reserveMicroUsd) {
      const reserve = wholeMicroUsd(reserveMicroUsd);
      if (calls >= limits.maxModelCallsPerRun) return refuse("model_calls_per_run");
      if (cost + reserve > limits.maxCostPerRunMicroUsd) return refuse("cost_per_run");
      if (spentElsewhereToday + cost + reserve > limits.maxCostPerDayMicroUsd) {
        return refuse("cost_per_day");
      }
      return { ok: true };
    },
    record(costMicroUsd) {
      calls += 1;
      cost += wholeMicroUsd(costMicroUsd);
    },
    get modelCalls() {
      return calls;
    },
    get costMicroUsd() {
      return cost;
    },
    get limitsHit() {
      return [...hit];
    },
  };
}
