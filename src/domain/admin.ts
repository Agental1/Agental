/**
 * Who is an admin (round 7, founders' decision 2026-11-20): the `isAdmin`
 * flag in the database AND an email on the allowlist. In production the
 * allowlist is contact@agental.co unless ADMIN_EMAILS says otherwise
 * (comma-separated). Outside production, with ADMIN_EMAILS unset, the flag
 * alone decides (local seed admin, tests). Checked on the server only.
 */
export const DEFAULT_ADMIN_EMAILS = ["contact@agental.co"] as const;

type Env = Record<string, string | undefined>;

export function adminEmails(env: Env = process.env): string[] | null {
  const raw = (env.ADMIN_EMAILS ?? "").trim();
  if (raw) return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return env.NODE_ENV === "production" ? [...DEFAULT_ADMIN_EMAILS] : null;
}

export function isAdminAccount(
  u: { isAdmin?: boolean | null; email?: string | null } | null | undefined,
  env: Env = process.env
): boolean {
  if (!u?.isAdmin) return false;
  const allow = adminEmails(env);
  if (!allow) return true;
  return !!u.email && allow.includes(u.email.trim().toLowerCase());
}
