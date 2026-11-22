import type { PrismaClient } from "@/generated/prisma/client";
import { toProfileFacts, type ProfileFacts } from "@/domain/workflow/profile";
import { workflowEligibility, type WorkflowMode } from "@/domain/workflow/eligibility";
import { emailIsVerified } from "@/lib/agents";
import { completenessOf } from "@/lib/completeness";

/**
 * Loading of the pilot profiles a run evaluates.
 *
 * A profile is skipped, silently and without a trace of who it was, when it
 * no longer exists (deleting an account removes its profile), when it is
 * flagged as a minor, when the 18+ gate cannot be established from its birth
 * date, when its email was never verified, or when its account is not
 * classified for the mode the run is in (src/domain/workflow/eligibility.ts):
 * test accounts in staging, reviewed performers in live, nobody else. An
 * account nobody has classified is never run.
 */

export type ProfilesDb = Pick<PrismaClient, "artistProfile">;

export interface LoadedProfiles {
  profiles: ProfileFacts[];
  /** How many requested ids were left out. A count, never the ids. */
  skipped: number;
}

export async function loadProfileFacts(
  db: ProfilesDb,
  profileIds: string[],
  now: Date,
  mode: WorkflowMode = "staging",
  /** firstAuto: the job is the first automatic search, its own consent record. */
  opts: { firstAuto?: boolean } = {}
): Promise<LoadedProfiles> {
  if (profileIds.length === 0) return { profiles: [], skipped: 0 };
  const rows = await db.artistProfile.findMany({
    where: { id: { in: profileIds } },
    select: {
      id: true,
      birthDate: true,
      isMinor: true,
      city: true,
      physical: true,
      preferences: true,
      mobilityCountries: true,
      minRateCents: true,
      stageName: true,
      bio: true,
      imdbUrl: true,
      portfolioUrl: true,
      media: { select: { type: true, category: true } },
      _count: { select: { specialties: true } },
      user: { select: { id: true, emailVerified: true, passwordHash: true, accounts: { select: { provider: true } }, accountStatus: true, agentsOptInAt: true, autoSearchOptIn: true } },
      specialties: { select: { kind: true, level: true, tags: true } },
      availability: { select: { from: true, to: true, type: true, zones: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const profiles: ProfileFacts[] = [];
  // The order of the pilot list is kept, so runs are repeatable.
  for (const id of profileIds) {
    const row = byId.get(id);
    if (!row || !row.user) continue;
    const facts = toProfileFacts(row, now);
    const eligible = workflowEligibility(
      {
        accountStatus: row.user.accountStatus,
        emailVerified: emailIsVerified(row.user),
        isAdult: facts.isAdult,
        profileComplete: completenessOf(row) === 100,
        optedIn: row.user.agentsOptInAt !== null || row.user.autoSearchOptIn || !!opts.firstAuto,
      },
      mode
    );
    if (eligible.ok) profiles.push(facts);
  }
  return { profiles, skipped: profileIds.length - profiles.length };
}
