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
  VIDEO: { maxBytes: 150 * MB, mimes: VIDEO_MIMES },
  SELFTAPE: { maxBytes: 150 * MB, mimes: VIDEO_MIMES },
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

export const CreateUploadInput = z
  .object({
    type: z.enum(UPLOAD_TYPES),
    destination: z.enum(UPLOAD_DESTINATIONS).optional(),
    mime: z.string().max(200).transform(baseMime),
    sizeBytes: z.number().int().positive(),
  })
  .transform((input) => ({
    ...input,
    destination:
      input.type === "PHOTO"
        ? ("profile" as const)
        : (input.destination ?? defaultDestination(input.type)),
  }));
export type CreateUploadInput = z.infer<typeof CreateUploadInput>;

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
export function storageKeyFor(
  type: UploadType,
  profileId: string,
  objectId: string,
  mime: string
): string {
  const prefix = type === "SELFTAPE" ? "selftape" : "media";
  const ext = EXTENSIONS[baseMime(mime)];
  return `${prefix}/${profileId}/${objectId}${ext ? `.${ext}` : ""}`;
}

/** Every prefix that can hold a talent's files, for account deletion. */
export function storagePrefixesFor(profileId: string): string[] {
  return [`media/${profileId}/`, `selftape/${profileId}/`];
}
