import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isAdult } from "@/domain/age";
import { COMPLETENESS_SELECT, completenessOf } from "@/lib/completeness";
import {
  workflowEligibility,
  workflowMode,
  type EligibilityFacts,
  type Eligibility,
  type WorkflowMode,
  type SearchAccess,
} from "@/domain/workflow/eligibility";
import { searchAccess } from "@/lib/app-settings";

type Db = Pick<Prisma.TransactionClient, "user" | "appSetting">;

/**
 * A sign-in provider (Google) proves the address; a password account proves it
 * with the verification email. Same rule as the admin list.
 */
export function emailIsVerified(u: {
  emailVerified: Date | null;
  passwordHash: string | null;
  accounts: { provider: string }[];
}): Date | null {
  if (u.emailVerified) return u.emailVerified;
  if (!u.passwordHash && u.accounts.length > 0) return new Date(0);
  return null;
}

export const ELIGIBILITY_SELECT = {
  emailVerified: true,
  passwordHash: true,
  accountStatus: true,
  deletedAt: true,
  agentsOptInAt: true,
  autoSearchOptIn: true,
  accounts: { select: { provider: true } },
  artistProfile: { select: { isMinor: true, ...COMPLETENESS_SELECT } },
} as const;

export type EligibilityRow = Prisma.UserGetPayload<{ select: typeof ELIGIBILITY_SELECT }>;

export function factsFrom(u: EligibilityRow, now = new Date()): Omit<EligibilityFacts, "optedIn"> & { optedIn: boolean } {
  const p = u.artistProfile;
  return {
    accountStatus: u.accountStatus,
    emailVerified: emailIsVerified(u),
    isAdult: !!p && !p.isMinor && isAdult(p.birthDate, now),
    profileComplete: !!p && completenessOf(p) === 100,
    optedIn: u.agentsOptInAt !== null || u.autoSearchOptIn,
  };
}

/**
 * The server-side gate in front of every agent job. `clicking` is true for the
 * "Start finding roles" click itself, which is the performer's opt-in.
 */
export async function agentEligibility(
  userId: string,
  opts: { clicking?: boolean; mode?: WorkflowMode; access?: SearchAccess; db?: Db; now?: Date } = {}
): Promise<Eligibility> {
  const db = opts.db ?? prisma;
  const u = await db.user.findUnique({ where: { id: userId }, select: ELIGIBILITY_SELECT });
  if (!u) return { ok: false, reason: "unreviewed" };
  // Round 9: deleted by an admin (restorable for 30 days): no agent, whatever the status.
  if (u.deletedAt) return { ok: false, reason: "revoked" };
  const facts = factsFrom(u, opts.now);
  return workflowEligibility(
    { ...facts, optedIn: opts.clicking ? "clicking" : facts.optedIn },
    opts.mode ?? workflowMode(),
    opts.access ?? (await searchAccess(db))
  );
}
