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
      media: { select: { type: true } },
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
  });
  await prisma.artistProfile.update({
    where: { id: profileId },
    data: { completenessScore: final },
  });
  return final;
}
