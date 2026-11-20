"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { recomputeCompleteness } from "@/lib/completeness";
import { getQualityScorer, type TipKey } from "@/lib/ai/quality-scorer";
import { err, type ActionError } from "@/domain/action-result";
import { toJson } from "@/domain/json";
import {
  checkUpload,
  CompleteUploadInput,
  CreateUploadInput,
  overQuota,
  storageKeyFor,
  UNTITLED_TAPE_TITLE,
  UPLOAD_TTL_MS,
  type UploadType,
} from "@/domain/uploads";

/**
 * Direct uploads: photos, videos and self-tapes go from the browser straight
 * to object storage, never through a server action's body.
 *
 *   1. createUpload   checks who is asking and what they declare, then hands
 *                     back an address that accepts exactly that one file.
 *   2. the browser    PUTs the file there, with progress (src/lib/media-upload.ts).
 *   3. completeUpload asks storage what really arrived, checks it again, and
 *                     only then creates the Media row.
 *
 * A file that never arrives leaves a pending Upload row that expires; Media
 * never points at a missing object. Nothing here returns a public URL: reads
 * go through /api/media/[id], which authorizes each request.
 *
 * A self-tape is saved as a version of a tape (src/lib/tapes.ts). An upload
 * that names a tape adds the next version to it; an upload that names none
 * starts a new tape with this file as version 1.
 */

export type CreateUploadResult =
  | {
      ok: true;
      uploadId: string;
      url: string;
      method: "PUT";
      headers: Record<string, string>;
    }
  | { ok: false; error: ActionError };

export type CompleteUploadResult =
  | {
      ok: true;
      mediaId: string;
      // Self-tapes only: the tape the file joined and its version number.
      tapeId?: string;
      takeNumber?: number;
      // Self-tapes only, when the browser sent its quality metrics.
      score?: number;
      breakdown?: { framing: number; light: number; sound: number };
      tips?: TipKey[];
    }
  | { ok: false; error: ActionError };

export type DeleteRecordingResult = { ok: true } | { ok: false; error: ActionError };

/**
 * The signed-in talent's profile, if they may store media: the profile is
 * their own and the person is an adult. V1 stores no minor's image.
 */
async function talentForMedia() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile || profile.isMinor) return null;
  return { userId: session.user.id, profile };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** The error's class and, for Prisma, its code. Its message stays out. */
function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? `${error.name} ${code}` : error.name;
}

/** Thrown inside the completion transaction when the named tape is gone. */
class TapeGone extends Error {}

/**
 * Media shows on the dashboard, the profile and the recordings page. The
 * layout pattern refreshes every page of the talent app in one call, and
 * keeps working when one of those pages is renamed.
 */
function revalidateMediaPages() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

export async function createUpload(input: unknown): Promise<CreateUploadResult> {
  const talent = await talentForMedia();
  if (!talent) return { ok: false, error: err("errors.unauthorized") };

  const parsed = CreateUploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const { type, destination, mime, sizeBytes, tapeId, title, demoBrief, consentVersion } =
    parsed.data;

  const refusal = checkUpload(type, mime, sizeBytes);
  if (refusal) return { ok: false, error: err(refusal.key, refusal.values) };

  const now = new Date();
  const profileId = talent.profile.id;

  // A new version can only join one of the caller's own tapes. Someone
  // else's tape and a tape that does not exist get the same answer.
  if (tapeId) {
    const tape = await prisma.tape.findFirst({
      where: { id: tapeId, profileId },
      select: { id: true },
    });
    if (!tape) return { ok: false, error: err("errors.tapeNotFound") };
  }

  // Uploads that were started and never finished stop counting once expired.
  await prisma.upload.deleteMany({ where: { profileId, expiresAt: { lt: now } } });
  const [media, pending] = await Promise.all([
    prisma.media.aggregate({
      where: { profileId },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
    prisma.upload.aggregate({
      where: { profileId },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    }),
  ]);
  const usage = {
    items: media._count._all + pending._count._all,
    totalBytes: (media._sum.sizeBytes ?? 0) + (pending._sum.sizeBytes ?? 0),
  };
  if (overQuota(usage, sizeBytes)) return { ok: false, error: err("errors.uploadQuota") };

  const storageKey = storageKeyFor(type, talent.userId, randomUUID(), mime);
  const upload = await prisma.upload.create({
    data: {
      profileId,
      type,
      destination,
      storageKey,
      mime,
      sizeBytes,
      tapeId: tapeId ?? null,
      title: title ?? null,
      demoBrief: demoBrief ?? null,
      consentVersion: consentVersion ?? null,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
    },
  });

  const storage = await getStorage();
  if (storage.presignUpload) {
    const signed = await storage.presignUpload(storageKey, mime, sizeBytes);
    return { ok: true, uploadId: upload.id, method: "PUT", ...signed };
  }
  // Local disk (development): the file goes through our own route instead.
  return {
    ok: true,
    uploadId: upload.id,
    method: "PUT",
    url: `/api/uploads/${upload.id}`,
    headers: { "Content-Type": mime },
  };
}

/**
 * Which tape a finished self-tape belongs to, and its version number there.
 *
 * With a tape named at createUpload, the file becomes that tape's next
 * version. Touching the tape row first also locks it until the transaction
 * ends, so two versions finishing together are numbered one after the other,
 * and a tape deleted in the meantime is noticed here.
 *
 * With no tape named, a new tape is created and the file is its version 1.
 */
async function placeTake(
  tx: Prisma.TransactionClient,
  upload: { tapeId: string | null; title: string | null; demoBrief: string | null },
  profileId: string,
  now: Date
): Promise<{ tapeId: string; takeNumber: number }> {
  if (upload.tapeId) {
    const touched = await tx.tape.updateMany({
      where: { id: upload.tapeId, profileId },
      data: { updatedAt: now },
    });
    if (touched.count === 0) throw new TapeGone();
    const last = await tx.selfTape.aggregate({
      where: { tapeId: upload.tapeId },
      _max: { takeNumber: true },
    });
    return { tapeId: upload.tapeId, takeNumber: (last._max.takeNumber ?? 0) + 1 };
  }
  const tape = await tx.tape.create({
    data: {
      profileId,
      title: upload.title ?? UNTITLED_TAPE_TITLE,
      demoBrief: upload.demoBrief ?? null,
    },
    select: { id: true },
  });
  return { tapeId: tape.id, takeNumber: 1 };
}

export async function completeUpload(input: unknown): Promise<CompleteUploadResult> {
  const talent = await talentForMedia();
  if (!talent) return { ok: false, error: err("errors.unauthorized") };

  const parsed = CompleteUploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const { uploadId, durationSec, metrics, lowBandwidth } = parsed.data;
  const profileId = talent.profile.id;

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.profileId !== profileId) {
    // A second call after a successful one finds the Media row instead.
    return { ok: false, error: err("errors.uploadNotFound") };
  }
  const type = upload.type as UploadType;
  const storage = await getStorage();

  if (upload.expiresAt.getTime() < Date.now()) {
    await prisma.upload.delete({ where: { id: upload.id } }).catch(() => undefined);
    await storage.delete(upload.storageKey).catch(() => undefined);
    return { ok: false, error: err("errors.uploadNotFound") };
  }

  // What storage holds is the authority, not what the browser declared.
  const stored = await storage.head(upload.storageKey);
  if (!stored) return { ok: false, error: err("errors.uploadFailed") };

  const discard = async () => {
    await storage.delete(upload.storageKey).catch(() => undefined);
    await prisma.upload.delete({ where: { id: upload.id } }).catch(() => undefined);
  };
  // A different size means the transfer was cut short or tampered with.
  if (stored.size !== upload.sizeBytes) {
    await discard();
    return { ok: false, error: err("errors.uploadFailed") };
  }
  const refusal = checkUpload(type, stored.mime, stored.size);
  if (refusal) {
    await discard();
    return { ok: false, error: err(refusal.key, refusal.values) };
  }

  const quality =
    type === "SELFTAPE" && metrics ? getQualityScorer().score(metrics) : null;

  let mediaId: string;
  let take: { tapeId: string; takeNumber: number } | null = null;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.media.count({ where: { profileId } });
      const hasPhoto =
        type === "PHOTO"
          ? (await tx.media.count({ where: { profileId, type: "PHOTO" } })) > 0
          : true;
      const placed =
        type === "SELFTAPE"
          ? await placeTake(
              tx,
              {
                tapeId: upload.tapeId ?? null,
                title: upload.title ?? null,
                demoBrief: upload.demoBrief ?? null,
              },
              profileId,
              new Date()
            )
          : null;
      const media = await tx.media.create({
        data: {
          profileId,
          type,
          storageKey: upload.storageKey,
          mime: upload.mime,
          destination: upload.destination,
          sizeBytes: stored.size,
          durationSec: durationSec ?? null,
          order: count,
          isPrimary: type === "PHOTO" && !hasPhoto,
          // Storage has just confirmed the file, so it is ready to play.
          status: "READY",
          title: upload.title ?? null,
          consentVersion: upload.consentVersion ?? null,
        },
      });
      if (placed) {
        await tx.selfTape.create({
          data: {
            mediaId: media.id,
            tapeId: placed.tapeId,
            takeNumber: placed.takeNumber,
            qualityScore: quality?.score ?? null,
            qualityBreakdown: toJson(quality?.breakdown ?? {}),
            status: "READY",
            lowBandwidth: lowBandwidth ?? false,
          },
        });
      }
      await tx.upload.delete({ where: { id: upload.id } });
      return { mediaId: media.id, placed };
    });
    mediaId = created.mediaId;
    take = created.placed;
  } catch (error) {
    if (error instanceof TapeGone) {
      // The tape was deleted while this version was on its way. Deleting a
      // tape removes all of it, so the late file goes too.
      await discard();
      return { ok: false, error: err("errors.tapeNotFound") };
    }
    if (!isUniqueViolation(error)) throw error;
    // Two completions raced: the other one created the row for this object.
    const existing = await prisma.media.findUnique({
      where: { storageKey: upload.storageKey },
      select: { id: true, selfTape: { select: { tapeId: true, takeNumber: true } } },
    });
    if (!existing) throw error;
    mediaId = existing.id;
    take = existing.selfTape?.tapeId
      ? { tapeId: existing.selfTape.tapeId, takeNumber: existing.selfTape.takeNumber }
      : null;
  }

  await recomputeCompleteness(profileId);
  revalidateMediaPages();
  return {
    ok: true,
    mediaId,
    ...(take ? { tapeId: take.tapeId, takeNumber: take.takeNumber } : {}),
    ...(quality
      ? { score: quality.score, breakdown: quality.breakdown, tips: quality.tips }
      : {}),
  };
}

/**
 * Delete a photo, video or self-tape version: the row first, then the stored
 * file. In that order a failure leaves an orphan object, which a sweep can
 * remove, never a row pointing at a file that is gone.
 *
 * The database removes what hangs off the row with it: the self-tape record,
 * every share link to the file (they answer 404 from then on) and its place
 * in any application draft. A tape whose last version is deleted stays as an
 * empty tape, with its title and brief, until deleteTape removes it.
 */
export async function deleteRecording(mediaId: string): Promise<DeleteRecordingResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  if (typeof mediaId !== "string" || mediaId.length === 0 || mediaId.length > 100) {
    return { ok: false, error: err("errors.mediaNotFound") };
  }
  const userId = session.user.id;
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      type: true,
      destination: true,
      storageKey: true,
      profileId: true,
      profile: { select: { userId: true } },
    },
  });
  if (!media || media.profile.userId !== userId) {
    return { ok: false, error: err("errors.mediaNotFound") };
  }

  await prisma.$transaction(async (tx) => {
    await tx.media.delete({ where: { id: media.id } });
    await audit(
      {
        actorUserId: userId,
        action: "media.delete",
        resourceType: "Media",
        resourceId: media.id,
        before: { type: media.type, destination: media.destination },
      },
      tx
    );
  });
  try {
    await (await getStorage()).delete(media.storageKey);
  } catch (error) {
    console.error("[uploads] stored object not removed, left for the sweep", {
      mediaId: media.id,
      error: errorLabel(error),
    });
  }
  await recomputeCompleteness(media.profileId);
  revalidateMediaPages();
  return { ok: true };
}
