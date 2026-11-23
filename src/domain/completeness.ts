import { parseJson, PhysicalTraits } from "./json";
import { mediaCategory } from "./media-categories";
import { readPreferences, type Preferences } from "./preferences";

/**
 * The single definition of a 100% profile (founders' decision, round 8; the
 * list is in docs/DECISIONS.md). One pure function, used by the profile, the
 * dashboard, the AI suggestions, the assistant, the admin and the server-side
 * eligibility for agents and the automatic first search.
 *
 * 100% means every required field is filled. Optional fields (stage name,
 * IMDb, portfolio, videos and the other media categories, accents, the other
 * physical tiles) never count; they come back as suggestions once the profile
 * is complete.
 */

export interface CompletenessInput {
  legalFirstName: string | null;
  legalLastName: string | null;
  /** The older single legal-name field: split at the first space when the two parts are empty. */
  legalName?: string | null;
  stageName?: string | null;
  birthDate: Date | null;
  gender: string | null;
  /** Free-text city (kept from before round 8) or a city picked from the list. */
  city: string | null;
  cityGeonameId?: number | null;
  phone: string | null;
  bio: string | null;
  physical: PhysicalTraits;
  /** Profile media and self-tapes; `category` as stored (null falls back on the type). */
  media: { type: string; category?: string | null }[];
  /** Already merged with the old specialties (readPreferences with kinds). */
  preferences: Preferences;
  minRateCents: number | null;
  imdbUrl?: string | null;
  portfolioUrl?: string | null;
}

/** Required items, in the order a performer meets them (tab by tab). */
export const REQUIRED_ITEMS = [
  "legalName",
  "birthDate",
  "gender",
  "city",
  "phone",
  "bio",
  "languages",
  "height",
  "build",
  "hair",
  "eyes",
  "photos",
  "workTypes",
  "ageRange",
  "compensation",
  "dayRate",
] as const;
export type MissingItem = (typeof REQUIRED_ITEMS)[number];

/** Optional items, suggested once the profile is complete. Never counted. */
export const PROFILE_GAPS = ["video", "links", "productions", "otherMedia", "stageName"] as const;
export type ProfileGap = (typeof PROFILE_GAPS)[number];

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** The legal name in two parts, from the new fields or the older single one. */
export function legalNameParts(p: Pick<CompletenessInput, "legalFirstName" | "legalLastName" | "legalName">) {
  const words = (p.legalName ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    first: filled(p.legalFirstName) ? p.legalFirstName!.trim() : (words[0] ?? ""),
    last: filled(p.legalLastName) ? p.legalLastName!.trim() : words.slice(1).join(" "),
  };
}

const inCategory = (media: CompletenessInput["media"], category: string) =>
  media.some((m) => m.type !== "SELFTAPE" && mediaCategory(m) === category);

/** Photos of yourself (headshots, full-length). Images only. */
const hasPhoto = (media: CompletenessInput["media"]) =>
  media.some((m) => m.type === "PHOTO" && mediaCategory(m) === "SELF");

/** A general video (showreel, clips), or a self-tape: both show the talent on camera. */
const hasVideo = (media: CompletenessInput["media"]) =>
  inCategory(media, "VIDEOS") || media.some((m) => m.type === "SELFTAPE");

/** Is the day rate needed? Only for "paid work only". */
export function needsDayRate(p: Pick<CompletenessInput, "preferences">): boolean {
  return p.preferences.compensation === "paid_only";
}

function isFilled(item: MissingItem, p: CompletenessInput): boolean {
  switch (item) {
    case "legalName": {
      const { first, last } = legalNameParts(p);
      return filled(first) && filled(last);
    }
    case "birthDate":
      return !!p.birthDate;
    case "gender":
      return filled(p.gender);
    case "city":
      return p.cityGeonameId != null || filled(p.city);
    case "phone":
      return filled(p.phone);
    case "bio":
      return filled(p.bio);
    case "languages":
      return p.physical.languages.some(filled);
    case "height":
      return p.physical.heightCm != null;
    case "build":
      // Round 10 (founder): build is required.
      return filled(p.physical.build);
    case "hair":
      return filled(p.physical.hair);
    case "eyes":
      return filled(p.physical.eyes);
    case "photos":
      return hasPhoto(p.media);
    case "workTypes":
      return p.preferences.projectTypes.length > 0 || p.preferences.roleTypes.length > 0;
    case "ageRange":
      return p.preferences.playableAgeMin != null && p.preferences.playableAgeMax != null;
    case "compensation":
      return p.preferences.compensation != null;
    case "dayRate":
      return !needsDayRate(p) || (p.minRateCents ?? 0) > 0;
  }
}

/** The required items that count for this profile (the day rate only with paid work only). */
function counted(p: CompletenessInput): MissingItem[] {
  return REQUIRED_ITEMS.filter((i) => i !== "dayRate" || needsDayRate(p));
}

/**
 * Every required item still missing, in tab order. The one list behind the
 * dashboard block, the profile's "Finish" button, the assistant and the deep
 * links. Empty exactly when the score is 100.
 */
export function missingItems(p: CompletenessInput): MissingItem[] {
  return counted(p).filter((i) => !isFilled(i, p));
}

export function nextMissingItem(p: CompletenessInput): MissingItem | null {
  return missingItems(p)[0] ?? null;
}

/** Share of required items filled, 0 to 100; 100 only when nothing is missing. */
export function scoreProfile(p: CompletenessInput): number {
  const items = counted(p);
  const done = items.filter((i) => isFilled(i, p)).length;
  if (done === items.length) return 100;
  return Math.min(99, Math.floor((done / items.length) * 100));
}

/** Optional items not done yet, for suggestions. */
export function profileGaps(p: CompletenessInput): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!hasVideo(p.media)) gaps.push("video");
  if (!filled(p.imdbUrl) && !filled(p.portfolioUrl)) gaps.push("links");
  if (!inCategory(p.media, "PRODUCTIONS")) gaps.push("productions");
  if (!inCategory(p.media, "OTHER")) gaps.push("otherMedia");
  if (!filled(p.stageName)) gaps.push("stageName");
  return gaps;
}

/**
 * The columns a profile row needs for the rule. Shared by every query that
 * shows or checks a percentage (`completenessScore` is only a cache).
 */
export interface CompletenessRow {
  legalFirstName: string | null;
  legalLastName: string | null;
  legalName: string | null;
  stageName: string;
  birthDate: Date | null;
  gender: string | null;
  city: string | null;
  cityGeonameId?: number | null;
  phone: string | null;
  bio: string | null;
  physical: string | null;
  preferences: string | null;
  minRateCents: number | null;
  imdbUrl: string | null;
  portfolioUrl: string | null;
  media: { type: string; category: string | null }[];
  specialties: { kind: string }[];
}

export function completenessInputOf(row: CompletenessRow): CompletenessInput {
  return {
    legalFirstName: row.legalFirstName,
    legalLastName: row.legalLastName,
    legalName: row.legalName,
    stageName: row.stageName,
    birthDate: row.birthDate,
    gender: row.gender,
    city: row.city,
    cityGeonameId: row.cityGeonameId ?? null,
    phone: row.phone,
    bio: row.bio,
    physical: parseJson(PhysicalTraits, row.physical),
    media: row.media,
    preferences: readPreferences(row.preferences, row.specialties.map((s) => s.kind)),
    minRateCents: row.minRateCents,
    imdbUrl: row.imdbUrl,
    portfolioUrl: row.portfolioUrl,
  };
}
