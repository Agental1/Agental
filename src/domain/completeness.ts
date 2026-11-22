import type { PhysicalTraits } from "./json";
import { mediaCategory } from "./media-categories";

/**
 * Profile completeness (0-100) and the list of what is still missing.
 *
 * Pure, so the score the dashboard shows, the score stored on the profile and
 * the "Complete your profile" card cannot disagree. The stored score used to
 * treat any `physical` column other than the literal "{}" as complete, and a
 * saved empty form serializes as {"languages":[],"accents":[]}, so a talent who
 * typed nothing still got the points.
 */

export interface CompletenessInput {
  stageName: string;
  birthDate: Date | null;
  city: string | null;
  bio: string | null;
  physical: PhysicalTraits;
  specialtiesCount: number;
  /** Profile media and self-tapes; `category` as stored (null falls back on the type). */
  media: { type: string; category?: string | null }[];
  /** Optional links. Either one counts. */
  imdbUrl?: string | null;
  portfolioUrl?: string | null;
}

/** What the dashboard asks for, in the order it lists them. */
export const PROFILE_GAPS = ["photos", "video", "physical", "bio", "links", "productions", "otherMedia"] as const;
export type ProfileGap = (typeof PROFILE_GAPS)[number];

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/**
 * Physical details count once a casting director can picture the talent: a
 * height plus at least one of hair, eyes or build. Signup now asks only for
 * the height, so the dashboard keeps asking for the rest.
 */
export function hasPhysicalDetails(p: PhysicalTraits): boolean {
  return p.heightCm != null && [p.hair, p.eyes, p.build].some(filled);
}

const inCategory = (media: CompletenessInput["media"], category: string) =>
  media.some((m) => m.type !== "SELFTAPE" && mediaCategory(m) === category);

/** Photos of yourself (headshots, full-length). */
const hasPhoto = (media: CompletenessInput["media"]) => inCategory(media, "SELF");

/** A general video (showreel, clips), or a self-tape: both show the talent on camera. */
const hasVideo = (media: CompletenessInput["media"]) =>
  inCategory(media, "VIDEOS") || media.some((m) => m.type === "SELFTAPE");

export function profileGaps(p: CompletenessInput): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!hasPhoto(p.media)) gaps.push("photos");
  if (!hasVideo(p.media)) gaps.push("video");
  if (!hasPhysicalDetails(p.physical)) gaps.push("physical");
  if (!filled(p.bio)) gaps.push("bio");
  if (!filled(p.imdbUrl) && !filled(p.portfolioUrl)) gaps.push("links");
  if (!inCategory(p.media, "PRODUCTIONS")) gaps.push("productions");
  if (!inCategory(p.media, "OTHER")) gaps.push("otherMedia");
  return gaps;
}

/** Items that count toward the score but are not on the dashboard card. */
export type MissingItem = ProfileGap | "height" | "city" | "specialties" | "birthDate" | "stageName";

/**
 * Everything still missing, in the order a performer should do it. The one
 * list behind the dashboard block, the suggestions, the assistant and the
 * profile's deep links, so none of them can ask for what is already filled.
 * Empty exactly when the score is 100.
 */
export function missingItems(p: CompletenessInput): MissingItem[] {
  const items: MissingItem[] = [];
  if (!filled(p.stageName)) items.push("stageName");
  if (!p.birthDate) items.push("birthDate");
  if (p.specialtiesCount === 0) items.push("specialties");
  for (const gap of profileGaps(p)) {
    // "physical" is split so the suggestion names what is really missing:
    // never ask for the height when it is saved and only the hair is not.
    items.push(gap === "physical" && p.physical.heightCm == null ? "height" : gap);
  }
  if (!filled(p.city)) items.push("city");
  return items;
}

/** The first thing still missing. */
export function nextMissingItem(p: CompletenessInput): MissingItem | null {
  return missingItems(p)[0] ?? null;
}

/** Weights sum to 100. */
export function scoreProfile(p: CompletenessInput): number {
  let score = 0;
  if (filled(p.stageName)) score += 15;
  if (p.birthDate) score += 10;
  if (filled(p.city)) score += 8;
  if (filled(p.bio)) score += 8;
  if (hasPhysicalDetails(p.physical)) score += 12;
  if (p.specialtiesCount > 0) score += 15;
  // Media, 20 points over the four categories.
  if (hasPhoto(p.media)) score += 8;
  if (hasVideo(p.media)) score += 6;
  if (inCategory(p.media, "PRODUCTIONS")) score += 4;
  if (inCategory(p.media, "OTHER")) score += 2;
  // Either link counts, the same rule as the "links" gap: a profile with one
  // link and nothing else missing is 100%, not 94%.
  if (filled(p.imdbUrl) || filled(p.portfolioUrl)) score += 12;
  return Math.min(100, score);
}
