import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isAdult } from "@/domain/age";
import {
  workflowEligibility,
  workflowMode,
  type EligibilityFacts,
  type Eligibility,
  type WorkflowMode,
} from "@/domain/workflow/eligibility";

type Db = Pick<Prisma.TransactionClient, "user">;

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
  agentsOptInAt: true,
  autoSearchOptIn: true,
  accounts: { select: { provider: true } },
  artistProfile: { select: { birthDate: true, isMinor: true } },
} as const;

export type EligibilityRow = Prisma.UserGetPayload<{ select: typeof ELIGIBILITY_SELECT }>;

export function factsFrom(u: EligibilityRow, now = new Date()): Omit<EligibilityFacts, "optedIn"> & { optedIn: boolean } {
  const p = u.artistProfile;
  return {
    accountStatus: u.accountStatus,
    emailVerified: emailIsVerified(u),
    isAdult: !!p && !p.isMinor && isAdult(p.birthDate, now),
    optedIn: u.agentsOptInAt !== null || u.autoSearchOptIn,
  };
}

/**
 * The server-side gate in front of every agent job. `clicking` is true for the
 * "Start finding roles" click itself, which is the performer's opt-in.
 */
export async function agentEligibility(
  userId: string,
  opts: { clicking?: boolean; mode?: WorkflowMode; db?: Db; now?: Date } = {}
): Promise<Eligibility> {
  const db = opts.db ?? prisma;
  const u = await db.user.findUnique({ where: { id: userId }, select: ELIGIBILITY_SELECT });
  if (!u) return { ok: false, reason: "unreviewed" };
  const facts = factsFrom(u, opts.now);
  return workflowEligibility(
    { ...facts, optedIn: opts.clicking ? "clicking" : facts.optedIn },
    opts.mode ?? workflowMode()
  );
}
