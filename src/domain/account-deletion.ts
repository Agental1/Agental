import { createHash } from "node:crypto";

/**
 * Which accounts staff may delete as fake (owner decision, round 7b): the
 * email was never verified, the account is older than N days (7 by default,
 * configurable), it never paid and belongs to no organization, and it is not
 * staff, an admin, a test account or one approved by the old manual review.
 * An account that was warned is never deleted before N days have passed since
 * the warning. A Google account is verified by Google, so it never qualifies.
 *
 * Pure, so the list, the warning email and the deletion use one rule.
 */
export const DEFAULT_DELETION_DAYS = 7;
export const MIN_DELETION_DAYS = 1;
export const MAX_DELETION_DAYS = 365;
/** Accounts handled per click, so a run fits in one serverless request. */
export const DELETION_BATCH = 200;

/** ACCOUNT_DELETION_AFTER_DAYS, or a ?days= value; anything invalid is the default. */
export function deletionDays(raw: string | null | undefined, fallback = DEFAULT_DELETION_DAYS): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(n) && n >= MIN_DELETION_DAYS && n <= MAX_DELETION_DAYS ? n : fallback;
}

export interface DeletionFacts {
  /** emailIsVerified(): the verification date, or epoch 0 for a Google account. */
  verifiedAt: Date | null;
  createdAt: Date;
  /** Paid anything, or belongs to an organization (whose plan may be paid). */
  paid: boolean;
  accountStatus: string | null;
  isAdmin: boolean;
  /** Round 10: Staff accounts are never deleted. */
  isStaff?: boolean;
  warnedAt: Date | null;
}

const PROTECTED_STATUSES = new Set(["STAFF", "TEST", "APPROVED"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export function deletionEligible(f: DeletionFacts, now: Date, days: number): boolean {
  if (f.verifiedAt) return false;
  if (f.paid || f.isAdmin || f.isStaff) return false;
  if (PROTECTED_STATUSES.has(f.accountStatus ?? "")) return false;
  const cutoff = now.getTime() - days * DAY_MS;
  // The warning promised N days: keep that promise.
  if (f.warnedAt && f.warnedAt.getTime() > cutoff) return false;
  return f.createdAt.getTime() <= cutoff;
}

/** What staff type to confirm: the word and the exact count on screen. */
export function confirmationPhrase(count: number): string {
  return `DELETE ${count}`;
}

/**
 * A fingerprint of the exact list on screen (ids and days). The form sends it
 * back, and the deletion refuses to run if the list changed meanwhile, so
 * nobody is deleted who was not shown.
 */
export function listFingerprint(ids: string[], days: number): string {
  return createHash("sha256").update(`${days}|${[...ids].sort().join(",")}`).digest("hex").slice(0, 32);
}

/** A verification link in the warning lasts the window, at most 7 days. */
export function warningLinkTtlMs(days: number): number {
  return Math.min(days, 7) * DAY_MS;
}
