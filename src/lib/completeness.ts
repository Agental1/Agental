import { prisma } from "@/lib/db";
import { scoreProfile } from "@/domain/completeness";
import { parseJson, PhysicalTraits } from "@/domain/json";

/**
 * Recompute and store a profile's completeness (0-100). Shared by onboarding,
 * profile edits, media and self-tape changes. The rule itself is the pure
 * scoreProfile() in src/domain/completeness.ts.
 */
export async function recomputeCompleteness(profileId: string): Promise<number> {
  const p = await prisma.artistProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: {
      media: { select: { type: true, category: true } },
      _count: { select: { specialties: true } },
    },
  });
  const final = scoreProfile({
    stageName: p.stageName,
    birthDate: p.birthDate,
    city: p.city,
    bio: p.bio,
    physical: parseJson(PhysicalTraits, p.physical),
    specialtiesCount: p._count.specialties,
    media: p.media,
    imdbUrl: p.imdbUrl,
    portfolioUrl: p.portfolioUrl,
  });
  await prisma.artistProfile.update({
    where: { id: profileId },
    data: { completenessScore: final },
  });
  return final;
}

/**
 * The columns scoreProfile() needs, for any query that shows a percentage
 * (the admin lists). Never show `completenessScore` itself: it is a cache
 * that rows scored by an older rule can leave stale. Same rule as the
 * dashboard and the profile page, from the same function.
 */
export const COMPLETENESS_SELECT = {
  stageName: true,
  birthDate: true,
  city: true,
  bio: true,
  physical: true,
  imdbUrl: true,
  portfolioUrl: true,
  media: { select: { type: true, category: true } },
  _count: { select: { specialties: true, media: true } },
} as const;

export function completenessOf(p: {
  stageName: string;
  birthDate: Date | null;
  city: string | null;
  bio: string | null;
  physical: string | null;
  imdbUrl: string | null;
  portfolioUrl: string | null;
  media: { type: string; category: string | null }[];
  _count: { specialties: number };
}): number {
  return scoreProfile({
    stageName: p.stageName,
    birthDate: p.birthDate,
    city: p.city,
    bio: p.bio,
    physical: parseJson(PhysicalTraits, p.physical),
    specialtiesCount: p._count.specialties,
    media: p.media,
    imdbUrl: p.imdbUrl,
    portfolioUrl: p.portfolioUrl,
  });
}
