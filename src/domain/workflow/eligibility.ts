import type { ErrorKey } from "@/domain/action-result";

/**
 * Who may trigger an AI agent (casting search, scheduled search, workflow
 * run). Checked on the server before any job is queued and again before a
 * run reads a profile, so an account that fails never reaches a rule, a model
 * or a draft.
 *
 * Every account starts UNREVIEWED (User.accountStatus) and is refused. Staff
 * set the status on /admin/comptes, and every change is audited:
 *
 *   APPROVED  a real account, reviewed
 *   TEST      the owner's own test accounts and synthetic profiles
 *   STAFF     the Agental team
 *   SPAM      tries and junk sign-ups
 *
 * Two modes, and an account qualifies for exactly one of them:
 *
 *   staging   TEST accounts only. This is the default, and what the dry run
 *             and every demonstration use. A real performer never runs here.
 *   live      APPROVED accounts only. A test account never runs here, so it
 *             can never receive real casting research or a workflow email.
 *
 * In both modes the email must be verified, the person must be an adult, and
 * the performer must have opted in: a click on "Start finding roles" (which is
 * itself the opt-in, see `optedIn` below) or the six-hour search switch.
 */
export const ACCOUNT_STATUSES = ["UNREVIEWED", "APPROVED", "TEST", "STAFF", "SPAM"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export function isAccountStatus(v: unknown): v is AccountStatus {
  return typeof v === "string" && (ACCOUNT_STATUSES as readonly string[]).includes(v);
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
  | "not_opted_in";

export type Eligibility = { ok: true } | { ok: false; reason: IneligibleReason };

/** Anything but the exact word "live" is staging, so a typo cannot go live. */
export function workflowMode(env: Record<string, string | undefined> = process.env): WorkflowMode {
  return (env.WORKFLOW_MODE ?? "").trim() === "live" ? "live" : "staging";
}

export interface EligibilityFacts {
  accountStatus: string | null | undefined;
  emailVerified: Date | null | undefined;
  isAdult: boolean;
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
  mode: WorkflowMode
): Eligibility {
  if (!account.isAdult) return { ok: false, reason: "not_adult" };
  if (!account.emailVerified) return { ok: false, reason: "email_unverified" };
  const status = account.accountStatus;
  if (status === "SPAM") return { ok: false, reason: "spam" };
  if (status === "STAFF") return { ok: false, reason: "staff" };
  if (status === "TEST") {
    return mode === "staging" ? { ok: true } : { ok: false, reason: "test_account" };
  }
  if (status === "APPROVED") {
    return mode === "live" ? { ok: true } : { ok: false, reason: "real_account" };
  }
  // UNREVIEWED, and any value nobody defined.
  return { ok: false, reason: "unreviewed" };
}

export function workflowEligibility(facts: EligibilityFacts, mode: WorkflowMode): Eligibility {
  const account = accountEligibility(facts, mode);
  if (!account.ok) return account;
  if (!facts.optedIn) return { ok: false, reason: "not_opted_in" };
  return { ok: true };
}

/** "Agents enabled" in the admin list: eligible now, opt-in included. */
export function agentsEnabled(facts: EligibilityFacts, mode: WorkflowMode): boolean {
  return workflowEligibility(facts, mode).ok;
}

/** The translation key a performer sees when a click is refused. */
export function refusalKey(reason: IneligibleReason): ErrorKey {
  if (reason === "email_unverified") return "errors.agentsEmailUnverified";
  if (reason === "unreviewed") return "errors.agentsUnderReview";
  return "errors.agentsUnavailable";
}
