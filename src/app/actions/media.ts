"use server";

import { usedInSubmittedResponse } from "@/lib/media-locks";
import { err, type ActionError } from "@/domain/action-result";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { recomputeCompleteness } from "@/lib/completeness";
import { MediaType } from "@/domain/enums";
import { z } from "zod";
import { DESCRIPTION_MAX, MEDIA_CATEGORIES, categoryAccepts, isMediaCategory } from "@/domain/media-categories";

export type MediaResult = { ok: boolean; error?: ActionError; id?: string };

async function talentProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
}

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB (dev)

export async function uploadMedia(formData: FormData): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };

  const file = formData.get("file");
  const typeRaw = formData.get("type");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: err("errors.noFile") };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: err("errors.fileTooLarge") };
  }
  const type = MediaType.safeParse(typeRaw);
  if (!type.success) return { ok: false, error: err("errors.invalidMediaType") };

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = `media/${profile.id}/${randomUUID()}`;
  const storage = await getStorage();
  await storage.put(key, bytes, file.type || "application/octet-stream");

  const count = await prisma.media.count({ where: { profileId: profile.id } });
  const media = await prisma.media.create({
    data: {
      profileId: profile.id,
      type: type.data,
      storageKey: key,
      mime: file.type || null,
      sizeBytes: bytes.length,
      order: count,
      isPrimary: type.data === "PHOTO" && count === 0,
    },
  });

  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, id: media.id };
}

export async function deleteMedia(mediaId: string): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.profileId !== profile.id) {
    return { ok: false, error: err("errors.mediaNotFound") };
  }
  if (await usedInSubmittedResponse([media.id])) return { ok: false, error: err("errors.mediaInResponse") };
  // Row first, then the file: a failure leaves an orphan object, never a row
  // that points at a file that is gone.
  await prisma.media.delete({ where: { id: mediaId } });
  await (await getStorage()).delete(media.storageKey).catch((error) => {
    console.error("[media] stored object not removed", { mediaId, error });
  });
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  // The dashboard lists missing photos and videos.
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true };
}

export async function setPrimaryMedia(mediaId: string): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.profileId !== profile.id || media.type !== "PHOTO") {
    return { ok: false, error: err("errors.invalidMedia") };
  }
  await prisma.$transaction([
    prisma.media.updateMany({
      where: { profileId: profile.id, type: "PHOTO" },
      data: { isPrimary: false },
    }),
    prisma.media.update({ where: { id: mediaId }, data: { isPrimary: true } }),
  ]);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  return { ok: true };
}

const MediaDetails = z.object({
  id: z.string().min(1).max(64),
  category: z.enum(MEDIA_CATEGORIES).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});

/**
 * The category and the short description of one of the performer's own
 * media. Both count toward profile completeness (the category does), so the
 * score is recomputed.
 */
export async function updateMediaDetails(input: unknown): Promise<MediaResult> {
  const parsed = MediaDetails.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const media = await prisma.media.findUnique({ where: { id: parsed.data.id }, select: { profileId: true, type: true } });
  if (!media || media.profileId !== profile.id) return { ok: false, error: err("errors.mediaNotFound") };
  // Round 8 type rules: photos of yourself are images, general videos are videos.
  if (parsed.data.category && isMediaCategory(parsed.data.category) && !categoryAccepts(parsed.data.category, media.type))
    return { ok: false, error: err("errors.mediaWrongCategory") };
  const description = parsed.data.description?.trim();
  await prisma.media.update({
    where: { id: parsed.data.id },
    data: {
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
    },
  });
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true };
}

const MediaLayout = z.object({
  /** Every category the performer touched, with its items in their new order. */
  layout: z
    .array(z.object({ category: z.enum(MEDIA_CATEGORIES), ids: z.array(z.string().min(1)).max(200) }))
    .max(MEDIA_CATEGORIES.length),
});

/**
 * Round 8: drag and drop in Profile > Media. Saves the order of each category
 * and moves items between categories in one transaction. A layout that breaks
 * a type rule, or names a file that is not the performer's, changes nothing.
 */
export async function saveMediaLayout(input: unknown): Promise<MediaResult> {
  const parsed = MediaLayout.safeParse(input);
  if (!parsed.success) return { ok: false, error: err("errors.invalidInput") };
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const ids = parsed.data.layout.flatMap((l) => l.ids);
  if (new Set(ids).size !== ids.length) return { ok: false, error: err("errors.invalidInput") };
  const rows = await prisma.media.findMany({
    where: { id: { in: ids }, profileId: profile.id },
    select: { id: true, type: true },
  });
  if (rows.length !== ids.length) return { ok: false, error: err("errors.mediaNotFound") };
  const typeOf = new Map(rows.map((r) => [r.id, r.type]));
  for (const l of parsed.data.layout)
    for (const id of l.ids)
      if (!categoryAccepts(l.category, typeOf.get(id)!)) return { ok: false, error: err("errors.mediaWrongCategory") };
  await prisma.$transaction(
    parsed.data.layout.flatMap((l) =>
      l.ids.map((id, order) => prisma.media.update({ where: { id }, data: { category: l.category, order } }))
    )
  );
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true };
}

/**
 * Round 8: "Use my profile picture as my first headshot". Copies the profile
 * picture into Photos of yourself as a new photo (the picture itself stays).
 */
export async function avatarAsHeadshot(): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const me = await prisma.artistProfile.findUnique({ where: { id: profile.id }, select: { avatarKey: true } });
  if (!me?.avatarKey) return { ok: false, error: err("errors.noFile") };
  const storage = await getStorage();
  const file = await storage.get(me.avatarKey);
  if (!file) return { ok: false, error: err("errors.noFile") };
  const key = `media/${profile.id}/${randomUUID()}`;
  await storage.put(key, file.bytes, file.mime || "image/jpeg");
  const count = await prisma.media.count({ where: { profileId: profile.id } });
  const hasPrimary = await prisma.media.count({ where: { profileId: profile.id, type: "PHOTO", isPrimary: true } });
  const media = await prisma.media.create({
    data: {
      profileId: profile.id,
      type: "PHOTO",
      category: "SELF",
      storageKey: key,
      mime: file.mime || "image/jpeg",
      sizeBytes: file.bytes.length,
      order: count,
      isPrimary: hasPrimary === 0,
    },
  });
  await recomputeCompleteness(profile.id);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, id: media.id };
}
