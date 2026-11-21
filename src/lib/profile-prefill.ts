import { prisma } from "@/lib/db";

/**
 * Fill a new profile from what Google gave at sign-in (User.name): the stage
 * name and the legal name, each only when it is still empty. The email is the
 * account's own. Nothing beyond the basic openid, email and profile scopes is
 * requested. Returns the updated row, or null when there was nothing to fill.
 */
export async function prefillFromProvider(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, accounts: { select: { provider: true } } },
  });
  const name = user?.name?.trim().slice(0, 80);
  if (!name || !user?.accounts.some((a) => a.provider === "google")) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { stageName: true, legalName: true },
  });
  if (!profile || profile.stageName) return null;
  const updated = await prisma.artistProfile.updateMany({
    where: { userId, stageName: "" },
    data: { stageName: name, ...(profile.legalName ? {} : { legalName: name }) },
  });
  if (updated.count === 0) return null;
  return prisma.artistProfile.findUnique({
    where: { userId },
    select: { id: true, stageName: true, avatarUpdatedAt: true, avatarKey: true },
  });
}
