import { prisma } from "@/lib/db";
import {
  completenessInputOf,
  scoreProfile,
  type CompletenessRow,
} from "@/domain/completeness";

/**
 * The columns the 100% rule needs (src/domain/completeness.ts), for any query
 * that shows or checks a percentage: the profile, the dashboard, the admin
 * lists and the eligibility for agents. Never show `completenessScore` itself:
 * it is a cache that rows scored by an older rule can leave stale.
 */
export const COMPLETENESS_SELECT = {
  legalFirstName: true,
  legalLastName: true,
  legalName: true,
  stageName: true,
  birthDate: true,
  gender: true,
  city: true,
  cityGeonameId: true,
  phone: true,
  bio: true,
  physical: true,
  preferences: true,
  minRateCents: true,
  imdbUrl: true,
  portfolioUrl: true,
  media: { select: { type: true, category: true } },
  specialties: { select: { kind: true } },
  _count: { select: { specialties: true, media: true } },
} as const;

export function completenessOf(p: CompletenessRow): number {
  return scoreProfile(completenessInputOf(p));
}

export interface RecomputeResult {
  completeness: number;
  /** True the first time the profile reaches 100% (the celebration). */
  justCompleted: boolean;
}

/**
 * Recompute and store a profile's completeness (0-100). Shared by onboarding,
 * profile edits, media and self-tape changes.
 */
export async function recomputeCompleteness(profileId: string): Promise<number> {
  return (await recomputeCompletenessDetailed(profileId)).completeness;
}

export async function recomputeCompletenessDetailed(profileId: string): Promise<RecomputeResult> {
  const p = await prisma.artistProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: {
      ...COMPLETENESS_SELECT,
      userId: true,
      completenessScore: true,
      profileCompletedAt: true,
    },
  });
  const final = completenessOf(p);
  // The first time the profile reaches 100%, stamp it: the celebration shows
  // once, whatever happens to the profile later.
  const justCompleted = final === 100 && !p.profileCompletedAt;
  await prisma.artistProfile.update({
    where: { id: profileId },
    data: {
      completenessScore: final,
      ...(justCompleted ? { profileCompletedAt: new Date() } : {}),
    },
  });
  // Reaching 100% starts the first AI search on its own (once, under the same
  // rules as a click). Only on the move to 100, so saves at 100% stay cheap.
  // Imported here to keep the import graph acyclic.
  if (final === 100 && p.completenessScore !== 100) {
    const { launchFirstAutoSearch } = await import("@/lib/auto-search");
    await launchFirstAutoSearch(p.userId);
  }
  return { completeness: final, justCompleted };
}
