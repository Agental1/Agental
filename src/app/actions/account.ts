"use server";

import { err, type ActionError } from "@/domain/action-result";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { storagePrefixesFor } from "@/domain/uploads";

export type ExportResult =
  | { ok: true; data: unknown }
  | { ok: false; error: ActionError };

/** RGPD: export everything we hold about the signed-in user, as JSON. */
export async function exportMyData(): Promise<ExportResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      artistProfile: {
        include: {
          specialties: true,
          availability: true,
          media: true,
          mandat: true,
          candidatures: { include: { matchScore: true } },
          careerEntries: true,
          minorCase: true,
        },
      },
      memberships: { include: { organization: true } },
    },
  });
  if (!user) return { ok: false, error: err("errors.notFound") };

  const [subscription, sites, siteOrders, studentPriceRequest] = await Promise.all([
    prisma.subscription.findUnique({ where: { subjectId: userId } }),
    prisma.site.findMany({ where: { userId } }),
    prisma.siteOrder.findMany({ where: { userId } }),
    prisma.studentPriceRequest.findUnique({ where: { userId } }),
  ]);

  // Redact secrets.
  const { passwordHash: _drop, ...safeUser } = user;
  void _drop;

  await audit({
    actorUserId: userId,
    action: "rgpd.export",
    resourceType: "User",
    resourceId: userId,
  });

  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      user: safeUser,
      subscription,
      sites,
      siteOrders,
      studentPriceRequest,
    },
  };
}

/** RGPD: permanently delete the account and everything cascading from it. */
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: ActionError }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  const userId = session.user.id;

  await audit({
    actorUserId: userId,
    action: "rgpd.delete",
    resourceType: "User",
    resourceId: userId,
  });

  // Delete organizations this user solely owns (would otherwise be orphaned).
  const ownerMemberships = await prisma.membership.findMany({
    where: { userId, role: "OWNER" },
    include: { organization: { include: { memberships: true } } },
  });
  for (const m of ownerMemberships) {
    const otherOwners = m.organization.memberships.filter(
      (x) => x.userId !== userId && x.role === "OWNER"
    );
    if (otherOwners.length === 0) {
      await prisma.subscription.deleteMany({
        where: { subjectId: m.organizationId },
      });
      await prisma.organization.delete({ where: { id: m.organizationId } });
    }
  }
  // Read before the delete: the profile id names the folders that hold this
  // person's photos, videos and self-tapes.
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  await prisma.subscription.deleteMany({ where: { subjectId: userId } });
  await prisma.user.delete({ where: { id: userId } }); // cascades profile, media rows, etc.

  // The rows are gone; now the files. This runs before signOut, which throws
  // a redirect, so nothing after it would execute. A failure here is logged
  // and must not undo a deletion the person asked for.
  if (profile) await removeStoredFiles(profile.id, userId);

  await signOut({ redirectTo: "/" });
  return { ok: true };
}

/** Delete every object under the talent's folders. Best effort, logged. */
async function removeStoredFiles(profileId: string, userId: string): Promise<void> {
  try {
    const storage = await getStorage();
    for (const prefix of storagePrefixesFor(profileId, userId)) {
      for (const key of await storage.list(prefix)) {
        await storage.delete(key);
      }
    }
  } catch (error) {
    console.error("[account] stored files not fully removed", { profileId, error });
  }
}
