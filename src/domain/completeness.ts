import type { PhysicalTraits } from "./json";

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
  media: { type: string }[];
  /** Optional links. Either one counts. */
  imdbUrl?: string | null;
  portfolioUrl?: string | null;
}

/** What the dashboard asks for, in the order it lists them. */
export const PROFILE_GAPS = ["photos", "video", "physical", "bio", "links"] as const;
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

const hasPhoto = (media: CompletenessInput["media"]) =>
  media.some((m) => m.type === "PHOTO");

/** A reel (VIDEO) or a self-tape both show the talent on camera. */
const hasVideo = (media: CompletenessInput["media"]) =>
  media.some((m) => m.type === "VIDEO" || m.type === "SELFTAPE");

export function profileGaps(p: CompletenessInput): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!hasPhoto(p.media)) gaps.push("photos");
  if (!hasVideo(p.media)) gaps.push("video");
  if (!hasPhysicalDetails(p.physical)) gaps.push("physical");
  if (!filled(p.bio)) gaps.push("bio");
  if (!filled(p.imdbUrl) && !filled(p.portfolioUrl)) gaps.push("links");
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
  if (hasPhoto(p.media)) score += 10;
  if (hasVideo(p.media)) score += 10;
  // Either link counts, the same rule as the "links" gap: a profile with one
  // link and nothing else missing is 100%, not 94%.
  if (filled(p.imdbUrl) || filled(p.portfolioUrl)) score += 12;
  return Math.min(100, score);
}
