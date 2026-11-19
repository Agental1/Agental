import { prisma } from "@/lib/db";
import { toRecording, type Recording } from "@/lib/recordings";

/**
 * A talent's self-tapes, grouped the way the talent thinks of them: a tape
 * has a title, an optional demo brief, and its saved versions.
 *
 * Server-only: call it from a server component or a server action, with the
 * signed-in talent's own profile id. Who is asking is the caller's check.
 *
 * Each version is a Recording (src/lib/recordings.ts): `takeNumber` is its
 * version number inside the tape, `status` says whether it can be played and
 * shared, and `url` is the authorizing route /api/media/<id>.
 *
 * A tape can have no version left, when its files were deleted one by one:
 * it is returned with an empty `versions` list. A title can be an empty
 * string, which means untitled; the interface supplies the label.
 *
 * Self-tapes saved before tapes existed belong to no tape and are absent
 * here. listRecordings still returns them, with `tapeId` null.
 */
export interface TapeWithVersions {
  id: string;
  title: string;
  demoBrief: string | null;
  createdAt: Date;
  /** Newest first. */
  versions: Recording[];
}

/** Every tape of one profile, newest tape first, versions newest first. */
export async function listTapes(profileId: string): Promise<TapeWithVersions[]> {
  const tapes = await prisma.tape.findMany({
    where: { profileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      takes: {
        // A version always belongs to the tape's own profile. Asking for it
        // again here keeps a stray row from showing someone else's file.
        where: { media: { profileId } },
        orderBy: [{ createdAt: "desc" }, { takeNumber: "desc" }],
        include: { media: true },
      },
    },
  });
  return tapes.map((tape) => ({
    id: tape.id,
    title: tape.title,
    demoBrief: tape.demoBrief,
    createdAt: tape.createdAt,
    versions: tape.takes.map((take) =>
      toRecording({
        ...take.media,
        selfTape: {
          qualityScore: take.qualityScore,
          takeNumber: take.takeNumber,
          tapeId: take.tapeId,
        },
      })
    ),
  }));
}
