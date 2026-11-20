import { z } from "zod";
import { B2C_PLANS, type AiSearchAllowance } from "./pricing";
import { PlanB2C } from "./enums";

/**
 * AI role searches ("Start finding roles"): the allowance rule, pure.
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
 * Used while the founders have not set the Premium and Ultimate allowances
 * (B2C_PLANS.*.aiSearches is null). TODO(founders): replace by real values.
 */
export const FALLBACK_ALLOWANCE: NonNullable<AiSearchAllowance> = { kind: "monthly", count: 50 };

export function allowanceFor(plan: PlanB2C): NonNullable<AiSearchAllowance> {
  return B2C_PLANS[plan].aiSearches ?? FALLBACK_ALLOWANCE;
}

/** "lifetime", or the calendar month in UTC as "YYYY-MM". */
export function periodKeyFor(allowance: NonNullable<AiSearchAllowance>, now: Date): string {
  if (allowance.kind === "lifetime") return "lifetime";
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface RoleSearchQuota {
  plan: PlanB2C;
  kind: "lifetime" | "monthly";
  limit: number;
  used: number;
  remaining: number;
  periodKey: string;
}

export function quotaFrom(plan: PlanB2C, used: number, now: Date): RoleSearchQuota {
  const allowance = allowanceFor(plan);
  return {
    plan,
    kind: allowance.kind,
    limit: allowance.count,
    used,
    remaining: Math.max(0, allowance.count - used),
    periodKey: periodKeyFor(allowance, now),
  };
}

/** A browser-made id: 8 to 64 URL-safe characters. */
export const RoleSearchClientKey = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
