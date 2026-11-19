import { normalizeEmail } from "./oauth-identity";

/**
 * Plan for lowercasing stored emails (tools/db/lowercase-emails.ts).
 *
 * The migration 20261120000000_normalize_user_emails does the rewrite on
 * deploy, and stops when two rows hold the same email once lowercased:
 * User.email is unique, and picking a winner between two accounts is a human
 * decision. This plan lists those groups so a person can settle them first.
 * They are reported and left alone.
 */
export interface EmailRow {
  id: string;
  email: string;
}

export interface EmailBackfillPlan {
  updates: { id: string; from: string; to: string }[];
  collisions: { normalized: string; rows: EmailRow[] }[];
}

export function planEmailBackfill(rows: EmailRow[]): EmailBackfillPlan {
  const groups = new Map<string, EmailRow[]>();
  for (const row of rows) {
    const key = normalizeEmail(row.email);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const plan: EmailBackfillPlan = { updates: [], collisions: [] };
  for (const [normalized, group] of groups) {
    if (group.length > 1) {
      plan.collisions.push({ normalized, rows: group });
      continue;
    }
    const [row] = group;
    if (row.email !== normalized) {
      plan.updates.push({ id: row.id, from: row.email, to: normalized });
    }
  }
  return plan;
}
