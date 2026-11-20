/**
 * Profile pictures. The browser crops the photo to a square and sends a small
 * JPEG (see AvatarEditor); the server checks the bytes themselves, never the
 * declared type, before storing it.
 */
export const AVATAR_MAX_BYTES = 900 * 1024; // under the 1 MB server action body cap
export const AVATAR_SIZE_PX = 512;

export type AvatarMime = "image/jpeg" | "image/png" | "image/webp";

/** The real type of an image from its first bytes, or null. */
export function sniffImage(bytes: Uint8Array): AvatarMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Up to two initials from a stage name or an email, for the empty avatar. */
export function initialsOf(name: string | null | undefined, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** Where the picture is served. `v` changes on every replace, so caches refresh. */
export function avatarSrc(userId: string, updatedAt: Date | null | undefined): string | null {
  return updatedAt ? `/api/avatar/${userId}?v=${updatedAt.getTime()}` : null;
}
