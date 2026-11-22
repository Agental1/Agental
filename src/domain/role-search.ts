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

/** Round 8b: a performer's searches start at most one every 6 hours. */
export const SEARCH_SPACING_HOURS = 6;
export const SEARCH_SPACING_MS = SEARCH_SPACING_HOURS * 60 * 60 * 1000;

/**
 * When a new search may start: now, or 6 hours after the performer's latest
 * search (queued, running or finished), whichever is later. `latest` is that
 * search's scheduled start, else its real start, else when it was queued.
 */
export function nextSearchStart(latest: Date | null, now: Date): Date {
  if (!latest) return now;
  const next = latest.getTime() + SEARCH_SPACING_MS;
  return next > now.getTime() ? new Date(next) : now;
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
  used: number;
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
 */
export function quotaFrom(plan: PlanB2C, used: number, periodStart: Date | null, now: Date): RoleSearchQuota {
  const limit = allowanceFor(plan).count;
  const active = periodActive(periodStart, now);
  const n = active ? used : 0;
  const end = active ? periodEnd(periodStart) : null;
  return {
    plan,
    limit,
    used: n,
    remaining: Math.max(0, limit - n),
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
