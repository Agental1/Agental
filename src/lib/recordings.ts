import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import type { UploadDestination } from "@/domain/uploads";

/**
 * A talent's videos and self-tapes, for the Reel & Self-tape page and the
 * profile's Media tab. Server-only: call it from a server component or a
 * server action, for the signed-in talent's own profile.
 *
 * `url` is our authorizing route, /api/media/<id>. It answers the owner (and
 * the parties src/lib/media-access.ts allows) with a short-lived signed
 * redirect. There is no public URL to a video anywhere.
 */
export interface Recording {
  id: string;
  type: "VIDEO" | "SELFTAPE";
  destination: UploadDestination;
  mime: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: Date;
  /** Self-tapes scored by the studio; null otherwise. */
  qualityScore: number | null;
  takeNumber: number | null;
  url: string;
}

export async function listRecordings(
  profileId: string,
  filter: { destination?: UploadDestination } = {}
): Promise<Recording[]> {
  const rows = await prisma.media.findMany({
    where: {
      profileId,
      type: { in: ["VIDEO", "SELFTAPE"] },
      ...(filter.destination ? { destination: filter.destination } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { selfTape: { select: { qualityScore: true, takeNumber: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type === "SELFTAPE" ? "SELFTAPE" : "VIDEO",
    destination: row.destination === "library" ? "library" : "profile",
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    durationSec: row.durationSec,
    createdAt: row.createdAt,
    qualityScore: row.selfTape?.qualityScore ?? null,
    takeNumber: row.selfTape?.takeNumber ?? null,
    url: mediaUrl(row.id),
  }));
}
