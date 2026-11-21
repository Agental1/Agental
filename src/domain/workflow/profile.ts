import { isAdult } from "@/domain/age";
import { cleanLine, truncate } from "./text";
import {
  readContentBoundaries,
  readPreferences,
  type Compensation,
} from "../preferences";

/**
 * The profile facts the workflow may read, and nothing else.
 *
 * This is the permission boundary. A rule or a model sees a ProfileFacts
 * value, never an ArtistProfile row, so a field that is absent here cannot be
 * read by accident. Left out on purpose: names, phone, bio, birth date (only
 * the 18+ answer crosses), every key of `physical` except the declared
 * languages, and all media. Height, hair, eyes and build are appearance.
 */
export interface AvailabilityWindow {
  /** First day, "yyyy-mm-dd" (UTC). */
  from: string;
  /** Last day, "yyyy-mm-dd" (UTC). */
  to: string;
  type: "AVAILABLE" | "UNAVAILABLE";
  /** Places the window applies to. Empty means everywhere. */
  zones: string[];
}

export interface ProfileFacts {
  profileId: string;
  /** The 18+ gate. The birth date itself stays behind. */
  isAdult: boolean;
  city: string | null;
  /** Countries the performer says they work in, as stored (ISO codes). */
  mobilityCountries: string[];
  specialties: Array<{ kind: string; level: string; tags: string[] }>;
  /** Languages the performer declared. */
  languages: string[];
  minRateCents: number | null;
  /**
   * Explicit preferences. Null means the performer never recorded an answer,
   * which is different from having said no.
   */
  preferences: {
    /** The private content boundary, not a general preference. */
    nudity: boolean | null;
    animals: boolean | null;
    projectTypes: string[];
    /** Paid work only, or open to unpaid work too. */
    compensation: Compensation | null;
  };
  availability: AvailabilityWindow[];
}

/** The ArtistProfile columns and relations the facts are built from. */
export interface ProfileRecord {
  id: string;
  birthDate: Date | null;
  isMinor: boolean;
  city: string | null;
  physical: string;
  preferences: string;
  mobilityCountries: string;
  minRateCents: number | null;
  specialties: Array<{ kind: string; level: string; tags: string }>;
  availability: Array<{ from: Date; to: Date; type: string; zones: string }>;
}

const MAX_WINDOWS = 60;

function readObject(raw: string | null | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function labels(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const cleaned = truncate(cleanLine(item), maxLength);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function readList(raw: string | null | undefined, maxItems: number, maxLength: number) {
  try {
    return labels(JSON.parse(raw ?? "[]"), maxItems, maxLength);
  } catch {
    return [];
  }
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Build the facts from a stored profile. `now` decides the 18+ answer and
 * which availability windows are already over.
 */
export function toProfileFacts(record: ProfileRecord, now: Date): ProfileFacts {
  const physical = readObject(record.physical);
  // One reader for the stored column (src/domain/preferences.ts), so the
  // workflow and the profile editor agree on what counts as an answer. In
  // particular the old form's default "no" reads as no answer.
  const preferences = readPreferences(record.preferences);
  const boundaries = readContentBoundaries(record.preferences);
  const today = day(now);

  const availability: AvailabilityWindow[] = record.availability
    .filter(
      (window) =>
        !Number.isNaN(window.from.getTime()) &&
        !Number.isNaN(window.to.getTime()) &&
        window.to.getTime() >= window.from.getTime()
    )
    .map((window) => ({
      from: day(window.from),
      to: day(window.to),
      type: window.type === "UNAVAILABLE" ? ("UNAVAILABLE" as const) : ("AVAILABLE" as const),
      zones: readList(window.zones, 10, 60),
    }))
    .filter((window) => window.to >= today)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .slice(0, MAX_WINDOWS);

  const city = record.city ? truncate(cleanLine(record.city), 120) : "";

  return {
    profileId: record.id,
    isAdult: !record.isMinor && isAdult(record.birthDate, now),
    city: city || null,
    mobilityCountries: readList(record.mobilityCountries, 60, 40).map((code) =>
      code.toUpperCase()
    ),
    specialties: record.specialties.slice(0, 20).map((specialty) => ({
      kind: truncate(cleanLine(specialty.kind), 40),
      level: truncate(cleanLine(specialty.level), 20),
      tags: readList(specialty.tags, 20, 60),
    })),
    languages: labels(physical.languages, 20, 40),
    minRateCents:
      typeof record.minRateCents === "number" && record.minRateCents > 0
        ? record.minRateCents
        : null,
    preferences: {
      nudity: boundaries.nudity,
      animals: preferences.animals,
      projectTypes: preferences.projectTypes,
      compensation: preferences.compensation,
    },
    availability,
  };
}
