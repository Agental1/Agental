import { z } from "zod";
import type { ErrorKey } from "./action-result";

/**
 * Rules for files a talent sends: photos, videos and self-tapes.
 *
 * The browser sends the file straight to object storage (see
 * src/app/actions/uploads.ts), so nothing here can rely on having seen the
 * bytes. These rules are checked twice: once on what the browser declares,
 * before a signed upload address is issued, and once on what storage reports
 * after the file has arrived. The second check is the one that counts.
 */

export const UPLOAD_TYPES = ["PHOTO", "VIDEO", "SELFTAPE"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

/**
 * Where a file lives in the product.
 * - "profile": part of the profile, shown to casting teams the talent applied to.
 * - "library": private to the talent until they choose to submit it.
 */
export const UPLOAD_DESTINATIONS = ["profile", "library"] as const;
export type UploadDestination = (typeof UPLOAD_DESTINATIONS)[number];

const MB = 1024 * 1024;

/**
 * Video size cap. 50 MB is the per-file limit of Supabase's Free plan; raise
 * it here and in src/lib/storage/supabase.ts (BUCKETS) once on a paid plan.
 */
export const VIDEO_MAX_MB = 50;

const VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const UPLOAD_LIMITS: Record<
  UploadType,
  { maxBytes: number; mimes: readonly string[] }
> = {
  PHOTO: {
    maxBytes: 15 * MB,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  },
  // Chrome and Firefox record WebM, Safari records MP4, phones upload MOV.
  VIDEO: { maxBytes: VIDEO_MAX_MB * MB, mimes: VIDEO_MIMES },
  SELFTAPE: { maxBytes: VIDEO_MAX_MB * MB, mimes: VIDEO_MIMES },
};

/** Per profile, counting finished media and uploads still in flight. */
export const UPLOAD_QUOTA = { maxItems: 60, maxTotalBytes: 3 * 1024 * MB };

/** How long a signed upload address, and the pending row behind it, lasts. */
export const UPLOAD_TTL_MS = 30 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * "video/webm;codecs=vp9,opus" and "Video/MP4" both name a container we
 * accept. Keep the type and subtype, drop parameters and case.
 */
export function baseMime(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.split(";")[0].trim().toLowerCase();
}

/** A photo is always part of the profile; a self-tape starts out private. */
export function defaultDestination(type: UploadType): UploadDestination {
  return type === "SELFTAPE" ? "library" : "profile";
}

/** Longest tape or clip title, tape demo brief and consent version label. */
export const TAPE_TITLE_MAX = 120;
export const TAPE_BRIEF_MAX = 2000;
export const CONSENT_VERSION_MAX = 40;

/**
 * The title of a tape created from an upload that carried none. An empty
 * string on purpose: the interface shows its own translated "Untitled" label
 * for it, so no sentence in one language is ever stored as a title.
 */
export const UNTITLED_TAPE_TITLE = "";

/** Optional text: trimmed, capped, and "not given" when nothing is left. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || undefined);

export const CreateUploadInput = z
  .object({
    type: z.enum(UPLOAD_TYPES),
    destination: z.enum(UPLOAD_DESTINATIONS).optional(),
    mime: z.string().max(200).transform(baseMime),
    sizeBytes: z.number().int().positive(),
    // Self-tapes: the tape this file becomes a new version of. Whether it
    // belongs to the caller is checked against the database in createUpload.
    tapeId: z.string().min(1).max(100).nullish(),
    title: optionalText(TAPE_TITLE_MAX),
    // Self-tapes: the brief of the tape this upload creates.
    demoBrief: optionalText(TAPE_BRIEF_MAX),
    // Which version of the upload notice the person accepted.
    consentVersion: optionalText(CONSENT_VERSION_MAX),
  })
  .transform((input) => ({
    ...input,
    destination:
      input.type === "PHOTO"
        ? ("profile" as const)
        : (input.destination ?? defaultDestination(input.type)),
    // Only a self-tape has versions and a brief. On a photo or a video the
    // two fields are dropped, the way a photo's destination is forced above.
    tapeId: input.type === "SELFTAPE" ? (input.tapeId ?? undefined) : undefined,
    demoBrief: input.type === "SELFTAPE" ? input.demoBrief : undefined,
  }));
export type CreateUploadInput = z.infer<typeof CreateUploadInput>;

/**
 * Rename a tape. An empty title is allowed and means untitled. `demoBrief`
 * left out keeps the current brief; null or an empty string clears it.
 */
export const RenameTapeInput = z.object({
  title: z.string().trim().max(TAPE_TITLE_MAX),
  demoBrief: z
    .string()
    .trim()
    .max(TAPE_BRIEF_MAX)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null)),
});
export type RenameTapeInput = z.infer<typeof RenameTapeInput>;

/**
 * Upload state of a stored file, as its owner sees it. A file still in
 * flight is an Upload row, so a Media row is READY from the start today.
 * PROCESSING and FAILED exist for a later transcoding or metadata step.
 */
export const MEDIA_STATUSES = ["PROCESSING", "READY", "FAILED"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/** A stored status, or FAILED for anything unexpected: never READY by default. */
export function toMediaStatus(raw: unknown): MediaStatus {
  return (MEDIA_STATUSES as readonly unknown[]).includes(raw)
    ? (raw as MediaStatus)
    : "FAILED";
}

export const CompleteUploadInput = z.object({
  uploadId: z.string().min(1).max(100),
  durationSec: z.number().int().min(0).max(4 * 60 * 60).optional(),
  // Self-tape quality metrics measured in the browser, each from 0 to 1.
  metrics: z
    .object({
      framing: z.number().min(0).max(1),
      light: z.number().min(0).max(1),
      sound: z.number().min(0).max(1),
      durationMs: z.number().min(0),
    })
    .optional(),
  lowBandwidth: z.boolean().optional(),
});
export type CompleteUploadInput = z.infer<typeof CompleteUploadInput>;

export type UploadRefusal = {
  key: Extract<ErrorKey, "errors.uploadTooLarge" | "errors.uploadTypeNotAllowed">;
  values?: Record<string, number>;
};

/**
 * Is this file acceptable for this kind of media? Used on the declared values
 * and again on what storage reports.
 */
export function checkUpload(
  type: UploadType,
  mime: string,
  sizeBytes: number
): UploadRefusal | null {
  const limit = UPLOAD_LIMITS[type];
  if (!limit.mimes.includes(baseMime(mime))) {
    return { key: "errors.uploadTypeNotAllowed" };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > limit.maxBytes) {
    return {
      key: "errors.uploadTooLarge",
      values: { limit: Math.round(limit.maxBytes / MB) },
    };
  }
  return null;
}

/** Would one more file of this size push the profile past its quota? */
export function overQuota(
  usage: { items: number; totalBytes: number },
  sizeBytes: number
): boolean {
  return (
    usage.items + 1 > UPLOAD_QUOTA.maxItems ||
    usage.totalBytes + sizeBytes > UPLOAD_QUOTA.maxTotalBytes
  );
}

/**
 * Object key: one folder per talent, a random name, the real extension.
 * Self-tapes and profile media sit under different prefixes so account
 * deletion and lifecycle rules can address them separately.
 */
/**
 * Where a new file goes: under the owner's user id, then its kind, e.g.
 * `{userId}/selftape/{uuid}.webm`. Files stored before 2026-11-20 sit under
 * `media/{profileId}/` and `selftape/{profileId}/`; each Media row keeps its
 * own key, so both layouts are read the same way.
 */
export function storageKeyFor(
  type: UploadType,
  userId: string,
  objectId: string,
  mime: string
): string {
  const kind = type === "SELFTAPE" ? "selftape" : "media";
  const ext = EXTENSIONS[baseMime(mime)];
  return `${userId}/${kind}/${objectId}${ext ? `.${ext}` : ""}`;
}

/** Every prefix that can hold a talent's files (both layouts), for account deletion. */
export function storagePrefixesFor(profileId: string, userId: string): string[] {
  return [`${userId}/`, `media/${profileId}/`, `selftape/${profileId}/`];
}
