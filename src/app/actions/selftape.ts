"use server";

import { err, type ActionError } from "@/domain/action-result";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getQualityScorer, type QualityMetrics } from "@/lib/ai/quality-scorer";
import { toJson } from "@/domain/json";

export type SelfTapeResult = {
  ok: boolean;
  error?: ActionError;
  score?: number;
  breakdown?: { framing: number; light: number; sound: number };
  tips?: string[];
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

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `selftape/${profile.id}/${randomUUID()}`;
  await (await getStorage()).put(key, bytes, file.type || "video/webm");

  const media = await prisma.media.create({
    data: {
      profileId: profile.id,
      type: "SELFTAPE",
      storageKey: key,
      mime: file.type || "video/webm",
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

  revalidatePath("/talents/app/self-tape");
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
  await (await getStorage()).delete(media.storageKey);
  await prisma.media.delete({ where: { id: mediaId } });
  revalidatePath("/talents/app/self-tape");
  return { ok: true };
}
