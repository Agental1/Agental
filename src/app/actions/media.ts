"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { recomputeCompleteness } from "@/lib/completeness";
import { MediaType } from "@/domain/enums";

export type MediaResult = { ok: boolean; error?: string; id?: string };

async function talentProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
}

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB (dev)

export async function uploadMedia(formData: FormData): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };

  const file = formData.get("file");
  const typeRaw = formData.get("type");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Aucun fichier." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (50 Mo max)." };
  }
  const type = MediaType.safeParse(typeRaw);
  if (!type.success) return { ok: false, error: "Type de média invalide." };

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
      order: count,
      isPrimary: type.data === "PHOTO" && count === 0,
    },
  });

  await recomputeCompleteness(profile.id);
  revalidatePath("/talents/app/profil");
  revalidatePath("/talents/app");
  return { ok: true, id: media.id };
}

export async function deleteMedia(mediaId: string): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.profileId !== profile.id) {
    return { ok: false, error: "Média introuvable." };
  }
  const storage = await getStorage();
  await storage.delete(media.storageKey);
  await prisma.media.delete({ where: { id: mediaId } });
  await recomputeCompleteness(profile.id);
  revalidatePath("/talents/app/profil");
  return { ok: true };
}

export async function setPrimaryMedia(mediaId: string): Promise<MediaResult> {
  const profile = await talentProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.profileId !== profile.id || media.type !== "PHOTO") {
    return { ok: false, error: "Média invalide." };
  }
  await prisma.$transaction([
    prisma.media.updateMany({
      where: { profileId: profile.id, type: "PHOTO" },
      data: { isPrimary: false },
    }),
    prisma.media.update({ where: { id: mediaId }, data: { isPrimary: true } }),
  ]);
  revalidatePath("/talents/app/profil");
  return { ok: true };
}
