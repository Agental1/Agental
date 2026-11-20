"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { err, type ActionError } from "@/domain/action-result";
import { AVATAR_MAX_BYTES, avatarSrc, sniffImage } from "@/domain/avatar";

export type AvatarResult = { ok: true; src: string | null } | { ok: false; error: ActionError };

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

async function talent() {
  const session = await auth();
  if (!session?.user?.id) {
    console.warn("[avatar] refused: no session");
    return { error: err("errors.unauthorized") } as const;
  }
  if (session.user.kind !== "TALENT") return { error: err("errors.mediaNotAllowed") } as const;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, userId: true, isMinor: true, avatarKey: true },
  });
  if (!profile || profile.isMinor) {
    console.warn("[avatar] refused:", profile ? "minor profile" : "no profile");
    return { error: err("errors.mediaNotAllowed") } as const;
  }
  return profile;
}

function refresh() {
  revalidatePath("/[locale]/talents/(space)", "layout");
}

/**
 * Store a new profile picture (already cropped square by the browser) under
 * `{userId}/avatar/`, then remove the previous one. Small enough to travel in
 * the action body, so it does not depend on direct uploads to storage.
 */
export async function setAvatar(formData: FormData): Promise<AvatarResult> {
  const me = await talent();
  if ("error" in me) return { ok: false, error: me.error };
  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: err("errors.invalidInput") };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: err("errors.avatarTooLarge") };
  return storeAvatar(me, Buffer.from(await file.arrayBuffer()));
}

async function storeAvatar(
  me: { id: string; userId: string; avatarKey: string | null },
  bytes: Buffer
): Promise<AvatarResult> {
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, error: err("errors.avatarType") };

  const storage = await getStorage();
  const key = `${me.userId}/avatar/${randomUUID()}.${EXT[mime]}`;
  try {
    await storage.put(key, bytes, mime);
  } catch (error) {
    console.error("[avatar] storage put failed", error instanceof Error ? error.message.slice(0, 120) : "error");
    return { ok: false, error: err("errors.uploadFailed") };
  }
  const now = new Date();
  await prisma.artistProfile.update({
    where: { id: me.id },
    data: { avatarKey: key, avatarUpdatedAt: now },
  });
  if (me.avatarKey && me.avatarKey !== key) await storage.delete(me.avatarKey).catch(() => undefined);
  refresh();
  return { ok: true, src: avatarSrc(me.userId, now) };
}

/** Only Google's photo host: the URL comes from the sign-in, never from a form. */
function isProviderPhotoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)googleusercontent\.com$/.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The person confirmed it in the welcome: use the photo of their Google
 * account as the profile picture. Never replaces a picture already chosen.
 */
export async function adoptProviderPhoto(): Promise<AvatarResult> {
  const me = await talent();
  if ("error" in me) return { ok: false, error: me.error };
  if (me.avatarKey) return { ok: true, src: avatarSrc(me.userId, new Date()) };
  const user = await prisma.user.findUnique({ where: { id: me.userId }, select: { image: true } });
  const url = user?.image ? isProviderPhotoUrl(user.image) : null;
  if (!url) return { ok: false, error: err("errors.avatarType") };
  // Google serves 96 px by default; ask for the size the app stores.
  url.pathname = url.pathname.replace(/=s\d+(-c)?$/, "");
  const sized = /=s\d+/.test(url.href) ? url.href : `${url.href}=s512-c`;
  try {
    const res = await fetch(sized, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, error: err("errors.uploadFailed") };
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) return { ok: false, error: err("errors.avatarTooLarge") };
    return storeAvatar(me, bytes);
  } catch {
    return { ok: false, error: err("errors.uploadFailed") };
  }
}

export async function removeAvatar(): Promise<AvatarResult> {
  const me = await talent();
  if ("error" in me) return { ok: false, error: me.error };
  await prisma.artistProfile.update({
    where: { id: me.id },
    data: { avatarKey: null, avatarUpdatedAt: null },
  });
  if (me.avatarKey) await (await getStorage()).delete(me.avatarKey).catch(() => undefined);
  refresh();
  return { ok: true, src: null };
}
