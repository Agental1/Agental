import { prisma } from "@/lib/db";
import { mediaUrl } from "@/lib/storage";
import {
  toMediaStatus,
  type MediaStatus,
  type UploadDestination,
} from "@/domain/uploads";

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
  /** Self-tapes: the version number inside its tape; null otherwise. */
  takeNumber: number | null;
  /**
   * Upload state. Only a READY file can be shared. A row is READY as soon as
   * it exists today; PROCESSING and FAILED are for a later processing step.
   */
  status: MediaStatus;
  title: string | null;
  /**
   * Self-tapes: the tape this file is a version of (see src/lib/tapes.ts).
   * Null for a video, and for a self-tape saved before tapes existed.
   */
  tapeId: string | null;
  url: string;
}

/** The columns a Recording is built from. */
export interface RecordingRow {
  id: string;
  type: string;
  destination: string;
  mime: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  createdAt: Date;
  status: string;
  title: string | null;
  selfTape: {
    qualityScore: number | null;
    takeNumber: number;
    tapeId: string | null;
  } | null;
}

/** One Media row, with its self-tape record, as the interface reads it. */
export function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    type: row.type === "SELFTAPE" ? "SELFTAPE" : "VIDEO",
    destination: row.destination === "library" ? "library" : "profile",
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    durationSec: row.durationSec,
    createdAt: row.createdAt,
    qualityScore: row.selfTape?.qualityScore ?? null,
    takeNumber: row.selfTape?.takeNumber ?? null,
    status: toMediaStatus(row.status),
    title: row.title,
    tapeId: row.selfTape?.tapeId ?? null,
    url: mediaUrl(row.id),
  };
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
    include: {
      selfTape: { select: { qualityScore: true, takeNumber: true, tapeId: true } },
    },
  });
  return rows.map(toRecording);
}
