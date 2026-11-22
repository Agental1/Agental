/**
 * Profile > Media, in four categories, in this order. Media is the general
 * material that helps us find auditions for the performer; Reel & Self-tape
 * holds the videos made for one audition.
 */
export const MEDIA_CATEGORIES = ["SELF", "PRODUCTIONS", "VIDEOS", "OTHER"] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export function isMediaCategory(v: unknown): v is MediaCategory {
  return typeof v === "string" && (MEDIA_CATEGORIES as readonly string[]).includes(v);
}

/** The closest category for a row that has none (written before categories). */
export function defaultCategory(type: string): MediaCategory {
  if (type === "PHOTO") return "SELF";
  if (type === "VIDEO" || type === "SELFTAPE") return "VIDEOS";
  return "OTHER";
}

export function mediaCategory(m: { type: string; category?: string | null }): MediaCategory {
  return isMediaCategory(m.category) ? m.category : defaultCategory(m.type);
}

/** What each category's picker accepts. */
export const CATEGORY_ACCEPT: Record<MediaCategory, string> = {
  SELF: "image/*",
  PRODUCTIONS: "image/*,video/*",
  VIDEOS: "video/*",
  OTHER: "image/*,video/*,audio/*",
};

export const DESCRIPTION_MAX = 160;
