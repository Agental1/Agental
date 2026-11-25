import { z } from "zod";
import { B2C_PLANS, type AiSearchAllowance } from "./pricing";
import { PlanB2C } from "./enums";

/**
 * AI role searches ("Start finding roles"): the allowance rule, pure.
 * A period starts at the first search and lasts 30 days, like a usage limit.
 * The allowance per plan lives in B2C_PLANS (src/domain/pricing.ts).
 */

export const ROLE_SEARCH_STATUSES = ["queued", "running", "done", "failed", "canceled"] as const;
export const RoleSearchStatus = z.enum(ROLE_SEARCH_STATUSES);
export type RoleSearchStatus = z.infer<typeof RoleSearchStatus>;

/** Statuses that hold a slot. A failed or canceled search gives it back. */
export const COUNTED_STATUSES: readonly RoleSearchStatus[] = ["queued", "running", "done"];
/** Statuses shown as "Search in progress". */
export const IN_PROGRESS_STATUSES: readonly RoleSearchStatus[] = ["queued", "running"];

/**
 * Round 8d: parallel slots. A plan runs `searchSlots` searches at the same
 * time; each slot starts at most one every `searchSpacingHours` (both in
 * B2C_PLANS, src/domain/pricing.ts). Basic has 1 slot, so it keeps the
 * round 8b rule of one search every 6 hours.
 */
export interface SearchPace {
  slots: number;
  spacingMs: number;
}

export function searchPaceFor(plan: PlanB2C): SearchPace {
  const def = B2C_PLANS[plan];
  return { slots: Math.max(1, def.searchSlots), spacingMs: def.searchSpacingHours * 60 * 60 * 1000 };
}

/** The gap in hours, for copy ("one every {hours} hours"). */
export const searchSpacingHoursFor = (plan: PlanB2C) => B2C_PLANS[plan].searchSpacingHours;

/**
 * When a new search may start. `starts` are the planned (or real, when later)
 * starts of the performer's searches (queued, running or finished). With S
 * slots, the slot that frees first is the one whose latest start is the S-th
 * most recent: the new search starts a gap after it, or now if that is later.
 * Fewer than S searches so far: a slot is free now.
 */
export function nextSearchStart(starts: readonly Date[], now: Date, pace: SearchPace): Date {
  if (starts.length < pace.slots) return now;
  const sorted = [...starts].sort((a, b) => b.getTime() - a.getTime());
  const next = sorted[pace.slots - 1].getTime() + pace.spacingMs;
  return next > now.getTime() ? new Date(next) : now;
}

/**
 * How many slots are busy at `now`: searches running, or finished less than a
 * gap after they started (a slot waits the gap before its next start). A
 * failed or canceled search gives its slot back, as it gives back its place
 * in the allowance; the queue-time schedule counts the same rows.
 */
export function busySlots(
  searches: readonly { status: string; startedAt: Date | null }[],
  now: Date,
  pace: SearchPace
): number {
  const since = now.getTime() - pace.spacingMs;
  return searches.filter(
    (r) => r.status === "running" || (r.status === "done" && r.startedAt && r.startedAt.getTime() > since)
  ).length;
}

/** "Starts in about N hours", rounded up to whole hours (0 means "soon"). */
export function hoursUntil(start: Date, now: Date): number {
  return Math.max(0, Math.ceil((start.getTime() - now.getTime()) / (60 * 60 * 1000)));
}

/**
 * Safety net if a plan has no allowance configured.
 */
export const FALLBACK_ALLOWANCE: NonNullable<AiSearchAllowance> = { kind: "monthly", count: 5 };

export function allowanceFor(plan: PlanB2C): NonNullable<AiSearchAllowance> {
  return B2C_PLANS[plan].aiSearches ?? FALLBACK_ALLOWANCE;
}

/** Length of a search period, counted from the user's first search. */
export const PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the period that began at `start` ends. */
export function periodEnd(start: Date): Date {
  return new Date(start.getTime() + PERIOD_DAYS * DAY_MS);
}

/** True while `start` is set and its 30 days have not passed. */
export function periodActive(start: Date | null, now: Date): start is Date {
  return !!start && now.getTime() < periodEnd(start).getTime();
}

/** Rows of one period share this key, derived from the period start. */
export function periodKeyFor(start: Date): string {
  return `p${start.getTime()}`;
}

export interface RoleSearchQuota {
  plan: PlanB2C;
  limit: number;
  /** Round 11.1: searches that started this period (the allowance they used). */
  used: number;
  /**
   * Round 11.1: searches held now, queued + running + used this period. A new
   * one is refused once held reaches the limit; `remaining` is limit - held.
   */
  held: number;
  remaining: number;
  /** Null until the first search of a period. */
  resetsAt: string | null;
  /** Whole days until the reset, rounded up (null with resetsAt). */
  resetInDays: number | null;
}

/**
 * `periodStart` is the user's stored start; an ended or missing period counts
 * as zero used (the next search starts a new one). A plan change only changes
 * the limit: the period and the reset date stay.
 *
 * Round 11.1 (founder): a search uses the allowance only once it starts
 * (`used`), but queued + running + used (`held`, at least `used`) may never
 * pass the limit. Without `held`, it is `used` (callers that count both alike).
 */
export function quotaFrom(plan: PlanB2C, used: number, periodStart: Date | null, now: Date, held?: number): RoleSearchQuota {
  const limit = allowanceFor(plan).count;
  const active = periodActive(periodStart, now);
  const n = active ? used : 0;
  const h = Math.max(n, held ?? n);
  const end = active ? periodEnd(periodStart) : null;
  return {
    plan,
    limit,
    used: n,
    held: h,
    remaining: Math.max(0, limit - h),
    resetsAt: end ? end.toISOString() : null,
    resetInDays: end ? Math.max(1, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)) : null,
  };
}

/** A browser-made id: 8 to 64 URL-safe characters. */
export const RoleSearchClientKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  // "auto…" keys belong to searches the server starts on its own.
  .refine((k) => !k.toLowerCase().startsWith("auto"));

/** Client keys of searches the server starts on its own. */
export const AUTO_KEY_PREFIX = "auto";
/** The first automatic search: one per account, ever (unique on userId + clientKey). */
export const FIRST_AUTO_KEY = "auto_first";
export const isAutoKey = (k: string | null | undefined) => !!k && k.startsWith(AUTO_KEY_PREFIX);
