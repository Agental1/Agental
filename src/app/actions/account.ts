"use server";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export type ExportResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

/** RGPD: export everything we hold about the signed-in user, as JSON. */
export async function exportMyData(): Promise<ExportResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Non autorisé." };
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
  if (!user) return { ok: false, error: "Introuvable." };

  const subscription = await prisma.subscription.findUnique({
    where: { subjectId: userId },
  });

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
    },
  };
}

/** RGPD: permanently delete the account and everything cascading from it. */
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Non autorisé." };
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
  await prisma.subscription.deleteMany({ where: { subjectId: userId } });
  await prisma.user.delete({ where: { id: userId } }); // cascades profile, media rows, etc.

  await signOut({ redirectTo: "/" });
  return { ok: true };
}
