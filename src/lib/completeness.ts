import { prisma } from "@/lib/db";

/** AI-style profile completeness (0–100). Shared by onboarding + profile edits. */
export async function recomputeCompleteness(profileId: string): Promise<number> {
  const p = await prisma.artistProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { specialties: true, media: true },
  });
  let score = 0;
  if (p.stageName) score += 15;
  if (p.birthDate) score += 10;
  if (p.city) score += 10;
  if (p.bio) score += 10;
  if (p.physical && p.physical !== "{}") score += 15;
  if (p.specialties.length > 0) score += 20;
  if (p.media.length > 0) score += 20;
  const final = Math.min(100, score);
  await prisma.artistProfile.update({
    where: { id: profileId },
    data: { completenessScore: final },
  });
  return final;
}
