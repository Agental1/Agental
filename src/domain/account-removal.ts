/**
 * Round 9, group 1: which accounts an admin may select in Admin > Accounts for
 * "Delete" or "Send warning email" (owner decision, round 9 brief):
 *
 *   - any account, warned or not, verified or not,
 *   - except staff, test and admin accounts, which can never be selected,
 *   - and (agent's decision, TODO(founders) in docs/DECISIONS.md) except an
 *     account that paid or belongs to an organization, whose deletion would
 *     leave a payment or a team without its owner.
 *
 * A deleted account is kept for RESTORE_DAYS (Admin > Deleted, restorable),
 * then purged with its files. Pure, so the page, the action and the purge
 * share one rule.
 */
export const RESTORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Accounts handled per click, so a run fits in one serverless request. */
export const REMOVAL_BATCH = 200;

export type RemovalBlock = "admin" | "staff" | "test" | "paid" | "deleted";

export interface RemovalFacts {
  isAdmin: boolean;
  accountStatus: string | null;
  /** Paid anything, or belongs to an organization. */
  paid: boolean;
  deletedAt: Date | null;
}

/** Why the account cannot be selected, or null when it can. */
export function removalBlock(f: RemovalFacts): RemovalBlock | null {
  if (f.deletedAt) return "deleted";
  if (f.isAdmin) return "admin";
  if (f.accountStatus === "STAFF") return "staff";
  if (f.accountStatus === "TEST") return "test";
  if (f.paid) return "paid";
  return null;
}

/** When a deleted account is purged for good. */
export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RESTORE_DAYS * DAY_MS);
}

/** True once the 30 days have passed. */
export function purgeDue(deletedAt: Date, now: Date): boolean {
  return now.getTime() >= purgeDate(deletedAt).getTime();
}

/** Days left before the purge, rounded up (30 right after the deletion). */
export function daysLeft(deletedAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((purgeDate(deletedAt).getTime() - now.getTime()) / DAY_MS));
}
