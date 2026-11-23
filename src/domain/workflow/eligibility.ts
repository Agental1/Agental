import type { ErrorKey } from "@/domain/action-result";

/**
 * Who may trigger an AI agent (casting search, scheduled search, workflow
 * run). Checked on the server before any job is queued and again before a
 * run reads a profile, so an account that fails never reaches a rule, a model
 * or a draft.
 *
 * Eligibility is automatic (owner decision, round 7b): a real account becomes
 * eligible once its email is verified (by the verification email, or by
 * Google) and its profile is 100% complete. Nobody approves accounts one by
 * one. Staff only mark exceptions on /admin/comptes, every change audited:
 *
 *   UNREVIEWED  the default: automatic (shown as "Automatic")
 *   APPROVED    legacy value from the manual review; treated like UNREVIEWED
 *   TEST        the owner's own test accounts and synthetic profiles
 *   STAFF       the Agental team
 *   SPAM        tries and junk sign-ups
 *   REVOKED     eligibility taken away by staff
 *
 * Two modes, and an account qualifies for exactly one of them:
 *
 *   staging   TEST accounts only. This is the default, and what the dry run
 *             and every demonstration use. A real performer never runs here.
 *   live      real accounts (UNREVIEWED or APPROVED). A test account never
 *             runs here, so it can never receive real research or an email.
 *
 * In both modes the email must be verified, the profile complete, the person
 * an adult, and the performer must have opted in: a click on "Start finding
 * roles" (which is itself the opt-in, see `optedIn` below), the six-hour
 * search switch, or the automatic first search (see src/lib/auto-search.ts).
 */
export const ACCOUNT_STATUSES = ["UNREVIEWED", "APPROVED", "TEST", "STAFF", "SPAM", "REVOKED"] as const;
/** What staff may set: exceptions only. UNREVIEWED means "automatic" again. */
export const STAFF_STATUSES = ["UNREVIEWED", "TEST", "SPAM", "REVOKED", "STAFF"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export function isStaffStatus(v: unknown): v is StaffStatus {
  return typeof v === "string" && (STAFF_STATUSES as readonly string[]).includes(v);
}
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
}

/**
 * Round 10 (founder): who may start an AI search, a switch in Admin > Controls
 * ("AI searches are open to"), not a hidden setting. "test_only" (the default,
 * and what an unreadable setting means): Test accounts only, as before.
 * "all_verified": every performer with a verified email and a 100% profile, Test
 * accounts included. WORKFLOW_MODE=live keeps its meaning (real accounts only).
 */
export const SEARCH_ACCESS = ["test_only", "all_verified"] as const;
export type SearchAccess = (typeof SEARCH_ACCESS)[number];

export function isSearchAccess(v: unknown): v is SearchAccess {
  return typeof v === "string" && (SEARCH_ACCESS as readonly string[]).includes(v);
}

export const WORKFLOW_MODES = ["staging", "live"] as const;
export type WorkflowMode = (typeof WORKFLOW_MODES)[number];

export type IneligibleReason =
  | "not_adult"
  | "email_unverified"
  | "unreviewed"
  | "spam"
  | "staff"
  | "test_account"
  | "real_account"
  | "not_opted_in"
  | "profile_incomplete"
  | "revoked";

export type Eligibility = { ok: true } | { ok: false; reason: IneligibleReason };

/** Anything but the exact word "live" is staging, so a typo cannot go live. */
export function workflowMode(env: Record<string, string | undefined> = process.env): WorkflowMode {
  return (env.WORKFLOW_MODE ?? "").trim() === "live" ? "live" : "staging";
}

export interface EligibilityFacts {
  accountStatus: string | null | undefined;
  emailVerified: Date | null | undefined;
  isAdult: boolean;
  /** Profile completeness is 100% (scoreProfile, the same rule as the dashboard). */
  profileComplete: boolean;
  /**
   * True when the performer clicked "Start finding roles" before or opted in
   * to the six-hour search. Pass `"clicking"` from the click itself: the click
   * is the opt-in, so it counts.
   */
  optedIn: boolean | "clicking";
}

/** The account side alone (status, email, age), without the opt-in. */
export function accountEligibility(
  account: Omit<EligibilityFacts, "optedIn">,
  mode: WorkflowMode,
  access: SearchAccess = "test_only"
): Eligibility {
  if (!account.isAdult) return { ok: false, reason: "not_adult" };
  if (!account.emailVerified) return { ok: false, reason: "email_unverified" };
  const status = account.accountStatus;
  if (status === "SPAM") return { ok: false, reason: "spam" };
  if (status === "STAFF") return { ok: false, reason: "staff" };
  if (status === "REVOKED") return { ok: false, reason: "revoked" };
  if (status === "TEST") {
    if (mode !== "staging") return { ok: false, reason: "test_account" };
  } else if (status === "UNREVIEWED" || status === "APPROVED") {
    // Round 10: the founder's switch opens searches to real performers in staging too.
    if (mode !== "live" && access !== "all_verified") return { ok: false, reason: "real_account" };
  } else {
    // Any value nobody defined.
    return { ok: false, reason: "unreviewed" };
  }
  if (!account.profileComplete) return { ok: false, reason: "profile_incomplete" };
  return { ok: true };
}

export function workflowEligibility(
  facts: EligibilityFacts,
  mode: WorkflowMode,
  access: SearchAccess = "test_only"
): Eligibility {
  const account = accountEligibility(facts, mode, access);
  if (!account.ok) return account;
  if (!facts.optedIn) return { ok: false, reason: "not_opted_in" };
  return { ok: true };
}

/** "Agents enabled" in the admin list: eligible now, opt-in included. */
export function agentsEnabled(facts: EligibilityFacts, mode: WorkflowMode, access: SearchAccess = "test_only"): boolean {
  return workflowEligibility(facts, mode, access).ok;
}

/** The translation key a performer sees when a click is refused. */
export function refusalKey(reason: IneligibleReason): ErrorKey {
  if (reason === "email_unverified") return "errors.agentsEmailUnverified";
  if (reason === "profile_incomplete") return "errors.agentsProfileIncomplete";
  return "errors.agentsUnavailable";
}
