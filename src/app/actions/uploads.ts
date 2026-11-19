"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
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
      // Self-tapes only, when the browser sent its quality metrics.
      score?: number;
      breakdown?: { framing: number; light: number; sound: number };
      tips?: TipKey[];
    }
  | { ok: false; error: ActionError };

export type DeleteRecordingResult = { ok: true } | { ok: false; error: ActionError };

/**
 * The signed-in talent's profile, if they may store media: represented (a
 * signed, active mandate) and an adult. V1 stores no minor's image.
 */
async function talentForMedia() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { mandat: { select: { status: true, signedAt: true } } },
  });
  if (!profile || profile.isMinor) return null;
  if (profile.mandat?.status !== "ACTIVE" || !profile.mandat.signedAt) return null;
  return { userId: session.user.id, profile };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

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
  const { type, destination, mime, sizeBytes } = parsed.data;

  const refusal = checkUpload(type, mime, sizeBytes);
  if (refusal) return { ok: false, error: err(refusal.key, refusal.values) };

  const now = new Date();
  const profileId = talent.profile.id;

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

  const storageKey = storageKeyFor(type, profileId, randomUUID(), mime);
  const upload = await prisma.upload.create({
    data: {
      profileId,
      type,
      destination,
      storageKey,
      mime,
      sizeBytes,
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
  try {
    mediaId = await prisma.$transaction(async (tx) => {
      const count = await tx.media.count({ where: { profileId } });
      const hasPhoto =
        type === "PHOTO"
          ? (await tx.media.count({ where: { profileId, type: "PHOTO" } })) > 0
          : true;
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
        },
      });
      if (type === "SELFTAPE") {
        const takeNumber =
          (await tx.selfTape.count({ where: { media: { profileId } } })) + 1;
        await tx.selfTape.create({
          data: {
            mediaId: media.id,
            takeNumber,
            qualityScore: quality?.score ?? null,
            qualityBreakdown: toJson(quality?.breakdown ?? {}),
            status: "READY",
            lowBandwidth: lowBandwidth ?? false,
          },
        });
      }
      await tx.upload.delete({ where: { id: upload.id } });
      return media.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Two completions raced: the other one created the row for this object.
    const existing = await prisma.media.findUnique({
      where: { storageKey: upload.storageKey },
      select: { id: true },
    });
    if (!existing) throw error;
    mediaId = existing.id;
  }

  await recomputeCompleteness(profileId);
  revalidateMediaPages();
  return quality
    ? {
        ok: true,
        mediaId,
        score: quality.score,
        breakdown: quality.breakdown,
        tips: quality.tips,
      }
    : { ok: true, mediaId };
}

/**
 * Delete a photo, video or self-tape: the row first, then the stored file.
 * In that order a failure leaves an orphan object, which a sweep can remove,
 * never a row pointing at a file that is gone.
 */
export async function deleteRecording(mediaId: string): Promise<DeleteRecordingResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  if (typeof mediaId !== "string" || mediaId.length === 0 || mediaId.length > 100) {
    return { ok: false, error: err("errors.mediaNotFound") };
  }
  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, storageKey: true, profileId: true, profile: { select: { userId: true } } },
  });
  if (!media || media.profile.userId !== session.user.id) {
    return { ok: false, error: err("errors.mediaNotFound") };
  }

  await prisma.media.delete({ where: { id: media.id } });
  try {
    await (await getStorage()).delete(media.storageKey);
  } catch (error) {
    console.error("[uploads] stored object not removed, left for the sweep", {
      mediaId: media.id,
      error,
    });
  }
  await recomputeCompleteness(media.profileId);
  revalidateMediaPages();
  return { ok: true };
}
