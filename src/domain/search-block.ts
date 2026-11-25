import type { MissingItem } from "./completeness";
import type { SearchAccess, WorkflowMode } from "./workflow/eligibility";

/**
 * Round 10, group 3: why "Start finding roles" cannot start a search for this
 * account, as ONE reason with the action that fixes it. The same list is shown
 * under the button, in its dialog, after a refused click, and in the admin
 * ("Can search: No: <reason>"), so the founder and the performer read the same
 * thing. Pure: the caller reads the account, the setting and the service.
 *
 * Order: what staff decided first, then what the performer can fix (email,
 * profile), then what only the founder's switch opens, then the allowance.
 */
export const SEARCH_BLOCKS = [
  "blocked",
  "not_adult",
  "email_unverified",
  "profile_incomplete",
  "not_open",
  "quota",
] as const;
export type SearchBlockReason = (typeof SEARCH_BLOCKS)[number];

export type SearchBlock =
  | { reason: "blocked" }
  | { reason: "not_adult" }
  | { reason: "email_unverified" }
  | { reason: "profile_incomplete"; missing: MissingItem[] }
  | { reason: "not_open" }
  | { reason: "quota"; limit: number; nextDate: string | null };

export interface SearchBlockFacts {
  kind: string;
  accountStatus: string;
  deleted: boolean;
  isAdult: boolean;
  emailVerified: boolean;
  missing: MissingItem[];
  quota: { limit: number; remaining: number; resetsAt: string | null };
  mode: WorkflowMode;
  access: SearchAccess;
}

export function searchBlock(f: SearchBlockFacts): SearchBlock | null {
  if (f.deleted || f.kind !== "TALENT") return { reason: "blocked" };
  if (["SPAM", "REVOKED", "STAFF"].includes(f.accountStatus)) return { reason: "blocked" };
  if (!["TEST", "UNREVIEWED", "APPROVED"].includes(f.accountStatus)) return { reason: "blocked" };
  if (!f.emailVerified) return { reason: "email_unverified" };
  if (f.missing.length > 0) return { reason: "profile_incomplete", missing: f.missing };
  if (!f.isAdult) return { reason: "not_adult" };
  if (f.accountStatus === "TEST") {
    // A Test account never runs in live (it would get real research).
    if (f.mode === "live") return { reason: "not_open" };
  } else if (f.mode !== "live" && f.access !== "all_verified") {
    return { reason: "not_open" };
  }
  if (f.quota.remaining <= 0) return { reason: "quota", limit: f.quota.limit, nextDate: f.quota.resetsAt };
  return null;
}

/**
 * Not a refusal: the click is saved and the search starts later. "waiting"
 * (round 11.1) while "Run searches" is off or this account does not run in the
 * current mode: queued, with no start time or estimate. "paused" when staff
 * paused everything or the search service is not connected; "queued" when
 * every slot is busy (startsAt is the planned start).
 */
export type SearchNotice = { kind: "waiting" } | { kind: "paused" } | { kind: "queued"; startsAt: string };
