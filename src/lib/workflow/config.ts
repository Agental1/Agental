/**
 * Environment of the dry-run workflow. Every switch is off when unset: no
 * secret means no intake route, no pilot list means nobody is evaluated, no
 * model flag means the rules decide alone.
 */

export type WorkflowEnv = Record<string, string | undefined>;

function setting(env: WorkflowEnv, name: string): string {
  return (env[name] ?? "").trim();
}

/** The intake signing secret, or null when the route is switched off. */
export function signingSecret(env: WorkflowEnv = process.env): string | null {
  return setting(env, "WORKFLOW_SIGNING_SECRET") || null;
}

const PROFILE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The profiles that opted in to the dry run, from WORKFLOW_PILOT_PROFILE_IDS
 * (comma-separated). Unset or empty means none.
 */
export function pilotProfileIds(env: WorkflowEnv = process.env): string[] {
  const ids = setting(env, "WORKFLOW_PILOT_PROFILE_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => PROFILE_ID.test(id));
  return [...new Set(ids)];
}

/**
 * Who a run evaluates: the pilot list, narrowed to `requested` when the
 * request names profiles. A request can never add a profile to the pilot.
 */
export function selectProfileIds(pilot: string[], requested?: string[]): string[] {
  if (!requested) return pilot;
  const wanted = new Set(requested);
  return pilot.filter((id) => wanted.has(id));
}

/** True only when WORKFLOW_MODEL_ENABLED is "true" or "1". */
export function modelEnabled(env: WorkflowEnv = process.env): boolean {
  const value = setting(env, "WORKFLOW_MODEL_ENABLED").toLowerCase();
  return value === "true" || value === "1";
}

/** Where a DEAD run is reported, or null. */
export function alertEmail(env: WorkflowEnv = process.env): string | null {
  return setting(env, "WORKFLOW_ALERT_EMAIL") || null;
}
