/**
 * Who may be put through a workflow run. Checked on the server before a run
 * reads a profile, so an account that fails never reaches a rule, a model or
 * a draft.
 *
 * Every account starts UNREVIEWED (User.workflowAccess) and is refused. A
 * person classifies it by hand:
 *
 *   TEST      the owner's own test accounts and synthetic profiles
 *   ELIGIBLE  a real performer, reviewed
 *   EXCLUDED  never to be run
 *
 * Two modes, and an account qualifies for exactly one of them:
 *
 *   staging   TEST accounts only. This is the default, and what the dry run
 *             and every demonstration use. A real performer never runs here.
 *   live      ELIGIBLE accounts only. A test account never runs here, so it
 *             can never receive real casting research or a workflow email.
 *
 * In both modes the email must be verified and the person must be an adult.
 */
export const WORKFLOW_ACCESS = ["UNREVIEWED", "TEST", "ELIGIBLE", "EXCLUDED"] as const;
export type WorkflowAccess = (typeof WORKFLOW_ACCESS)[number];

export const WORKFLOW_MODES = ["staging", "live"] as const;
export type WorkflowMode = (typeof WORKFLOW_MODES)[number];

export type IneligibleReason =
  | "not_adult"
  | "email_unverified"
  | "unreviewed"
  | "excluded"
  | "test_account"
  | "real_account";

export type Eligibility = { ok: true } | { ok: false; reason: IneligibleReason };

/** Anything but the exact word "live" is staging, so a typo cannot go live. */
export function workflowMode(env: Record<string, string | undefined> = process.env): WorkflowMode {
  return (env.WORKFLOW_MODE ?? "").trim() === "live" ? "live" : "staging";
}

export function workflowEligibility(
  account: {
    workflowAccess: string | null | undefined;
    emailVerified: Date | null | undefined;
    isAdult: boolean;
  },
  mode: WorkflowMode
): Eligibility {
  if (!account.isAdult) return { ok: false, reason: "not_adult" };
  if (!account.emailVerified) return { ok: false, reason: "email_unverified" };
  const access = account.workflowAccess;
  if (access === "EXCLUDED") return { ok: false, reason: "excluded" };
  if (access === "TEST") {
    return mode === "staging" ? { ok: true } : { ok: false, reason: "test_account" };
  }
  if (access === "ELIGIBLE") {
    return mode === "live" ? { ok: true } : { ok: false, reason: "real_account" };
  }
  // UNREVIEWED, and any value nobody defined.
  return { ok: false, reason: "unreviewed" };
}
