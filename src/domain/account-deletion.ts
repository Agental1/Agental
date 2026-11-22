/**
 * Which accounts staff may delete as fake (owner decision, round 7b): the
 * email was never verified, the account is older than N days (7 by default,
 * configurable), it never paid, and it is not staff, an admin or a test
 * account. A Google account is verified by Google, so it never qualifies.
 *
 * Pure, so the list, the warning email and the deletion use one rule, and the
 * deletion re-checks it account by account at the moment it runs.
 */
export const DEFAULT_DELETION_DAYS = 7;
export const MIN_DELETION_DAYS = 1;
export const MAX_DELETION_DAYS = 365;

/** ACCOUNT_DELETION_AFTER_DAYS, or a ?days= value; anything invalid is the default. */
export function deletionDays(raw: string | null | undefined, fallback = DEFAULT_DELETION_DAYS): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(n) && n >= MIN_DELETION_DAYS && n <= MAX_DELETION_DAYS ? n : fallback;
}

export interface DeletionFacts {
  /** emailIsVerified(): the verification date, or epoch 0 for a Google account. */
  verifiedAt: Date | null;
  createdAt: Date;
  paid: boolean;
  accountStatus: string | null;
  isAdmin: boolean;
}

const PROTECTED_STATUSES = new Set(["STAFF", "TEST"]);

export function deletionEligible(f: DeletionFacts, now: Date, days: number): boolean {
  if (f.verifiedAt) return false;
  if (f.paid || f.isAdmin) return false;
  if (PROTECTED_STATUSES.has(f.accountStatus ?? "")) return false;
  return f.createdAt.getTime() <= now.getTime() - days * 24 * 60 * 60 * 1000;
}

/** What staff type to confirm: the word and the exact count on screen. */
export function confirmationPhrase(count: number): string {
  return `DELETE ${count}`;
}
