import { prisma } from "@/lib/db";

/**
 * Who may read a stored media object.
 *
 * Lives here rather than inside the route handler for two reasons: Next 16
 * rejects non-handler exports from a route file, and the risk in this rule is
 * the SHAPE of the membership query — a mocked Prisma would only assert the
 * mock, so tests/api/media-access.test.ts exercises it against the real
 * database.
 *
 * Three parties qualify:
 *   - the talent who owns the profile the media hangs off;
 *   - a casting user whose ORGANISATION has a candidature on that profile,
 *     which is the point of a shortlist (self-tapes, photos);
 *   - an admin, for the minors compliance back-office.
 *
 * Scoped by membership, not by "is a casting account" — otherwise any casting
 * user could read every talent's media in the database.
 */
export async function canReadMedia(
  userId: string,
  profileId: string,
  opts: { destination?: string | null; status?: string | null } = {}
): Promise<boolean> {
  const [owned, user] = await Promise.all([
    prisma.artistProfile.findFirst({
      where: { id: profileId, userId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    }),
  ]);
  if (owned || user?.isAdmin) return true;

  // A file that is still processing, or that failed, is the owner's to see
  // and nobody else's.
  if (opts.status && opts.status !== "READY") return false;

  // A library item (a self-tape or reel the talent has not submitted) is
  // private: no casting user reads it, whatever their link to the profile.
  if (opts.destination === "library") return false;

  const viaCandidature = await prisma.candidature.findFirst({
    where: {
      artistProfileId: profileId,
      project: {
        organization: { memberships: { some: { userId } } },
      },
    },
    select: { id: true },
  });
  return viaCandidature !== null;
}
