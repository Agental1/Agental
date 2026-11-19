"use server";

import { err, type ActionError } from "@/domain/action-result";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { recomputeCompleteness } from "@/lib/completeness";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import {
  getQualityScorer,
  type QualityMetrics,
  type TipKey,
} from "@/lib/ai/quality-scorer";
import { toJson } from "@/domain/json";
import { baseMime, storageKeyFor } from "@/domain/uploads";

export type SelfTapeResult = {
  ok: boolean;
  error?: ActionError;
  score?: number;
  breakdown?: { framing: number; light: number; sound: number };
  // Translation keys, not sentences: the action runs on the server and the
  // advice is read on the client, in the visitor's language.
  tips?: TipKey[];
};

export async function saveSelfTape(
  formData: FormData
): Promise<SelfTapeResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) return { ok: false, error: err("errors.profileNotFound") };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: err("errors.noVideo") };
  }
  let metrics: QualityMetrics;
  try {
    metrics = JSON.parse(String(formData.get("metrics") ?? "{}"));
  } catch {
    return { ok: false, error: err("errors.invalidMetrics") };
  }
  const lowBandwidth = formData.get("lowBandwidth") === "true";

  // Legacy path, kept until the studio moves to uploadMedia() in
  // src/lib/media-upload.ts: the file travels in this action's body, which
  // the platform caps at a few MB.
  const bytes = Buffer.from(await file.arrayBuffer());
  // Safari records MP4 and labels it so; only an unlabelled blob is assumed WebM.
  const mime = baseMime(file.type) || "video/webm";
  const key = storageKeyFor("SELFTAPE", profile.id, randomUUID(), mime);
  await (await getStorage()).put(key, bytes, mime);

  const media = await prisma.media.create({
    data: {
      profileId: profile.id,
      type: "SELFTAPE",
      storageKey: key,
      mime,
      // Private to the talent until they choose to submit it.
      destination: "library",
      sizeBytes: bytes.length,
    },
  });

  const result = getQualityScorer().score(metrics);
  const takeNumber =
    (await prisma.selfTape.count({
      where: { media: { profileId: profile.id } },
    })) + 1;

  await prisma.selfTape.create({
    data: {
      mediaId: media.id,
      takeNumber,
      qualityScore: result.score,
      qualityBreakdown: toJson(result.breakdown),
      status: "READY",
      lowBandwidth,
    },
  });

  // A self-tape counts toward completeness and clears the dashboard's
  // "add a self-tape or reel" item.
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/self-tape", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return {
    ok: true,
    score: result.score,
    breakdown: result.breakdown,
    tips: result.tips,
  };
}

export async function deleteSelfTape(mediaId: string): Promise<SelfTapeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
  });
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!profile || !media || media.profileId !== profile.id) {
    return { ok: false, error: err("errors.notFound") };
  }
  // Row first, then the file: a failure leaves an orphan object, never a row
  // that points at a file that is gone.
  await prisma.media.delete({ where: { id: mediaId } });
  await (await getStorage()).delete(media.storageKey).catch((error) => {
    console.error("[selftape] stored object not removed", { mediaId, error });
  });
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/self-tape", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true };
}
