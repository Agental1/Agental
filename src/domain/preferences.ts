import { z } from "zod";

/**
 * What jobs a performer wants and can take, and, apart from that, their
 * private content boundaries.
 *
 * Both live in one JSON column (ArtistProfile.preferences) under separate
 * keys, and are saved by separate actions, so saving one never touches the
 * other:
 *
 *   { v: 2, projectTypes, roleTypes, compensation, travel, workModes, animals,
 *     contentBoundaries: { nudity } }
 *
 * Every choice is optional and an unset choice stays unset: an empty list or a
 * null removes the key. Nothing here has a default that reads as an answer.
 *
 * Languages are not here on purpose. They are already stored with the profile
 * (physical.languages, saved by saveProfilePhysical); an editor can show them
 * under Preferences without a second copy.
 */

export const PROJECT_TYPES = [
  "film",
  "tv-streaming",
  "commercial",
  "theatre",
  "voice",
  "music-video",
  "short-film",
  "student-film",
  "web-digital",
  "corporate",
  "live-event",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const ROLE_TYPES = [
  "lead",
  "supporting",
  "day-player",
  "background",
  "stand-in",
  "voice",
  "host",
] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

/** "paid_only": paid work only. "paid_or_unpaid": open to unpaid work too. */
export const COMPENSATION = ["paid_only", "paid_or_unpaid"] as const;
export type Compensation = (typeof COMPENSATION)[number];

/** How far the performer travels for work, widest last. */
export const TRAVEL = ["local", "regional", "national", "international"] as const;
export type Travel = (typeof TRAVEL)[number];

export const WORK_MODES = ["on_set", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** Marks a value written by this schema. See readPreferences on why it matters. */
export const PREFERENCES_VERSION = 2;

const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .nullish()
    .transform((chosen) => [...new Set(chosen ?? [])]);

/**
 * The whole Preferences form, as the editor submits it. A field left out, null
 * or empty means "no answer". Unknown fields (the old form sent `nudity`,
 * `autoApply` and `dailyCap`) are dropped, never stored from here.
 */
export const PreferencesInput = z.object({
  projectTypes: list(PROJECT_TYPES),
  roleTypes: list(ROLE_TYPES),
  compensation: z.enum(COMPENSATION).nullish().transform((v) => v ?? null),
  travel: z.enum(TRAVEL).nullish().transform((v) => v ?? null),
  workModes: list(WORK_MODES),
  /** Comfortable working with animals. */
  animals: z.boolean().nullish().transform((v) => v ?? null),
});
export type PreferencesInput = z.input<typeof PreferencesInput>;

/** Preferences as read back: lists are empty and single choices null when unset. */
export interface Preferences {
  projectTypes: ProjectType[];
  roleTypes: RoleType[];
  compensation: Compensation | null;
  travel: Travel | null;
  workModes: WorkMode[];
  animals: boolean | null;
}

/**
 * Optional and private. Shown to the performer only, never to a casting team,
 * and never part of general preferences.
 */
export const ContentBoundariesInput = z.object({
  nudity: z.boolean().nullable(),
});
export type ContentBoundariesInput = z.infer<typeof ContentBoundariesInput>;

export interface ContentBoundaries {
  /** true: open to roles with nudity. false: never. null: no answer given. */
  nudity: boolean | null;
}

type Stored = Record<string, unknown>;

function parseStored(raw: unknown): Stored {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Stored;
  if (typeof raw !== "string") return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Stored) : {};
  } catch {
    return {};
  }
}

function known<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is T => allowed.includes(v as T)))];
}

function one<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Was this stored by the old form? It wrote `nudity: false` and
 * `animals: false` for everyone who pressed Save, whether or not they had
 * looked at the toggles. So in an old value a `true` is a choice and a `false`
 * is only the default: it is read as "no answer".
 */
function isLegacy(stored: Stored): boolean {
  return stored.v !== PREFERENCES_VERSION;
}

/** Job preferences from the stored column. Tolerates anything that is in there. */
export function readPreferences(raw: unknown): Preferences {
  const stored = parseStored(raw);
  const animals =
    typeof stored.animals === "boolean" && (stored.animals || !isLegacy(stored))
      ? stored.animals
      : null;
  return {
    projectTypes: known(stored.projectTypes, PROJECT_TYPES),
    roleTypes: known(stored.roleTypes, ROLE_TYPES),
    compensation: one(stored.compensation, COMPENSATION),
    travel: one(stored.travel, TRAVEL),
    workModes: known(stored.workModes, WORK_MODES),
    animals,
  };
}

/**
 * Content boundaries from the stored column. An earlier "yes" given through
 * the old Preferences toggle is carried over; the old default "no" is not a
 * choice and reads as no answer.
 */
export function readContentBoundaries(raw: unknown): ContentBoundaries {
  const stored = parseStored(raw);
  const own = stored.contentBoundaries;
  if (own && typeof own === "object" && !Array.isArray(own)) {
    const nudity = (own as Stored).nudity;
    return { nudity: typeof nudity === "boolean" ? nudity : null };
  }
  return { nudity: stored.nudity === true ? true : null };
}

/** Keys the Preferences form owns. Everything else in the column is kept. */
const OWNED = ["projectTypes", "roleTypes", "compensation", "travel", "workModes", "animals"] as const;

/**
 * The column's next value after the Preferences form is saved. Content
 * boundaries are carried through untouched (an earlier "yes" from the old
 * toggle is moved under its own key on the way), and keys this form does not
 * own stay as they are.
 */
export function mergePreferences(raw: unknown, input: z.output<typeof PreferencesInput>): Stored {
  const stored = parseStored(raw);
  const boundaries = readContentBoundaries(stored);
  const next: Stored = { ...stored };
  delete next.nudity;
  for (const key of OWNED) delete next[key];

  if (input.projectTypes.length > 0) next.projectTypes = input.projectTypes;
  if (input.roleTypes.length > 0) next.roleTypes = input.roleTypes;
  if (input.compensation !== null) next.compensation = input.compensation;
  if (input.travel !== null) next.travel = input.travel;
  if (input.workModes.length > 0) next.workModes = input.workModes;
  if (input.animals !== null) next.animals = input.animals;

  if (boundaries.nudity !== null) next.contentBoundaries = { nudity: boundaries.nudity };
  else delete next.contentBoundaries;
  next.v = PREFERENCES_VERSION;
  return next;
}

/**
 * The column's next value after content boundaries are saved. Null clears the
 * answer. Job preferences are kept exactly as they read today, which also
 * settles an old value: once this is written, the old defaults can no longer
 * be mistaken for answers.
 */
export function mergeContentBoundaries(raw: unknown, input: ContentBoundariesInput): Stored {
  const stored = parseStored(raw);
  const current = readPreferences(stored);
  const next = mergePreferences(stored, current);
  if (input.nudity === null) delete next.contentBoundaries;
  else next.contentBoundaries = { nudity: input.nudity };
  return next;
}
