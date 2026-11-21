import type { PrismaClient, User } from "@/generated/prisma/client";
import { normalizeEmail } from "./oauth-identity";

/**
 * Account lookups by email, in any letter case.
 *
 * Signup used to store the email as typed, and User.email is unique byte for
 * byte. A row saved as "Ana@X.com" keeps that casing until the migration
 * 20261120000000_normalize_user_emails rewrites it, and an exact lookup on
 * "ana@x.com" misses it: its owner can no longer sign in, and signup or a
 * provider opens a second account for the same address. Sign-in, signup and
 * the provider check all look up emails here, so they hold on either side of
 * that migration.
 */

/**
 * The rows whose email is `email` once trimmed and lowercased: the row stored
 * in exactly that form first, the others in the order given.
 */
export function emailMatches<T extends { email: string }>(
  rows: T[],
  email: string
): T[] {
  const normalized = normalizeEmail(email);
  const matches = rows.filter((row) => normalizeEmail(row.email) === normalized);
  return [
    ...matches.filter((row) => row.email === normalized),
    ...matches.filter((row) => row.email !== normalized),
  ];
}

/**
 * Every user holding `email` in any letter case, oldest first after the exact
 * match. Prisma sends a case-insensitive `equals` to Postgres as ILIKE, which
 * reads "_" and "%" as wildcards, so emailMatches drops the rows that only
 * matched through one of them.
 */
export async function findUsersByEmail(
  db: Pick<PrismaClient, "user">,
  email: string
): Promise<User[]> {
  const rows = await db.user.findMany({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  return emailMatches(rows, email);
}
