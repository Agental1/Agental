import { toProfileFacts, type ProfileRecord } from "@/domain/workflow/profile";

/**
 * The synthetic performer used for the one-person calibration.
 *
 * Maya Okafor does not exist. She is the same fictional Los Angeles screen and
 * stage actor the site uses in its sample portfolio. No real person's data is
 * in this file, and nothing here is stored in a database.
 *
 * The record has the shape of a stored profile and goes through the same
 * reader as a real one (toProfileFacts), so the exercise covers that code too.
 */
export const CALIBRATION_NOW = new Date("2026-11-19T18:00:00Z");

export const MAYA_PREFERENCES = {
  v: 2,
  projectTypes: ["film", "tv-streaming", "theatre", "short-film"],
  roleTypes: ["lead", "supporting"],
  compensation: "paid_only",
  travel: "regional",
  workModes: ["on_set"],
  animals: true,
  contentBoundaries: { nudity: false },
};

export function mayaRecord(preferences: Record<string, unknown> = MAYA_PREFERENCES): ProfileRecord {
  return {
    id: "synthetic-maya-okafor",
    birthDate: new Date("1996-03-14T00:00:00Z"),
    isMinor: false,
    city: "Los Angeles",
    physical: JSON.stringify({ languages: ["English", "Spanish"] }),
    preferences: JSON.stringify(preferences),
    mobilityCountries: JSON.stringify(["US"]),
    // 200 USD. A brief's rate has no unit yet, so this is compared as given.
    minRateCents: 20000,
    specialties: [
      { kind: "screen-acting", level: "CONFIRMED", tags: "[]" },
      { kind: "stage-acting", level: "CONFIRMED", tags: "[]" },
    ],
    availability: [
      {
        from: new Date("2026-12-01T00:00:00Z"),
        to: new Date("2027-02-28T00:00:00Z"),
        type: "AVAILABLE",
        zones: "[]",
      },
      {
        from: new Date("2026-12-22T00:00:00Z"),
        to: new Date("2026-12-28T00:00:00Z"),
        type: "UNAVAILABLE",
        zones: "[]",
      },
    ],
  };
}

export function mayaFacts(preferences?: Record<string, unknown>) {
  return toProfileFacts(mayaRecord(preferences), CALIBRATION_NOW);
}
