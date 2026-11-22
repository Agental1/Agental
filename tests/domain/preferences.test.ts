import { describe, expect, it } from "vitest";
import {
  ContentBoundariesInput,
  PREFERENCES_VERSION,
  PreferencesInput,
  mergeContentBoundaries,
  mergePreferences,
  readContentBoundaries,
  readPreferences,
} from "@/domain/preferences";

/**
 * Job preferences and the private content boundaries share one stored JSON
 * value. What these pin: an unset choice stays unset, saving one of the two
 * never changes the other, and a value written by the old form (which stored
 * `false` for everyone) is not read as a set of answers.
 */

const parse = (input: unknown) => PreferencesInput.parse(input);
const unset = {
  projectTypes: [],
  roleTypes: [],
  compensation: null,
  travel: null,
  workModes: [],
  animals: null,
  playableAgeMin: null,
  playableAgeMax: null,
};

describe("PreferencesInput", () => {
  it("reads an empty form as no answer at all", () => {
    expect(parse({})).toEqual(unset);
    expect(parse({ projectTypes: null, travel: null, animals: null })).toEqual(unset);
  });

  it("keeps the choices that were made and drops duplicates", () => {
    expect(
      parse({
        projectTypes: ["film", "film", "commercial"],
        roleTypes: ["supporting"],
        compensation: "paid_only",
        travel: "regional",
        workModes: ["on_set", "remote"],
        animals: false,
      })
    ).toEqual({
      projectTypes: ["film", "commercial"],
      roleTypes: ["supporting"],
      compensation: "paid_only",
      travel: "regional",
      workModes: ["on_set", "remote"],
      animals: false,
      playableAgeMin: null,
      playableAgeMax: null,
    });
  });

  it("refuses a value outside the lists", () => {
    expect(PreferencesInput.safeParse({ projectTypes: ["podcast"] }).success).toBe(false);
    expect(PreferencesInput.safeParse({ travel: "everywhere" }).success).toBe(false);
  });

  it("drops what the old form used to send: nudity is not a general preference", () => {
    const parsed = parse({ nudity: true, autoApply: true, dailyCap: 5, animals: true });
    expect(parsed).toEqual({ ...unset, animals: true });
    expect(parsed).not.toHaveProperty("nudity");
    expect(parsed).not.toHaveProperty("autoApply");
  });
});

describe("readPreferences", () => {
  it("answers 'unset' for anything unreadable", () => {
    for (const raw of [null, undefined, "", "{", "[]", "42", '"x"']) {
      expect(readPreferences(raw)).toEqual(unset);
    }
  });

  it("ignores stored values that are no longer offered", () => {
    const raw = JSON.stringify({
      v: PREFERENCES_VERSION,
      projectTypes: ["film", "Long métrage"],
      travel: "galactic",
      workModes: "on_set",
    });
    expect(readPreferences(raw)).toEqual({ ...unset, projectTypes: ["film"] });
  });

  it("does not take the old form's default 'no' for an answer", () => {
    // What the old form stored for anyone who pressed Save.
    const old = JSON.stringify({ autoApply: false, projectTypes: [], nudity: false, animals: false });
    expect(readPreferences(old).animals).toBeNull();
    expect(readContentBoundaries(old)).toEqual({ nudity: null });
  });

  it("keeps an old 'yes', which was a choice", () => {
    const old = JSON.stringify({ nudity: true, animals: true });
    expect(readPreferences(old).animals).toBe(true);
    expect(readContentBoundaries(old)).toEqual({ nudity: true });
  });

  it("reads a current 'no' as a no", () => {
    const raw = JSON.stringify({
      v: PREFERENCES_VERSION,
      animals: false,
      contentBoundaries: { nudity: false },
    });
    expect(readPreferences(raw).animals).toBe(false);
    expect(readContentBoundaries(raw)).toEqual({ nudity: false });
  });
});

describe("mergePreferences", () => {
  it("stores only what was answered", () => {
    const next = mergePreferences("{}", parse({ travel: "local" }));
    expect(next).toEqual({ v: PREFERENCES_VERSION, merged: true, travel: "local" });
  });

  it("clears an answer that the form now leaves empty", () => {
    const stored = JSON.stringify({ v: PREFERENCES_VERSION, travel: "local", roleTypes: ["lead"] });
    expect(mergePreferences(stored, parse({ roleTypes: ["lead"] }))).toEqual({
      v: PREFERENCES_VERSION,
      merged: true,
      roleTypes: ["lead"],
    });
  });

  it("never touches content boundaries", () => {
    const stored = JSON.stringify({
      v: PREFERENCES_VERSION,
      contentBoundaries: { nudity: false },
      travel: "local",
    });
    const next = mergePreferences(stored, parse({ animals: true }));
    expect(readContentBoundaries(next)).toEqual({ nudity: false });
    expect(next).not.toHaveProperty("nudity");
  });

  it("moves an old 'yes' under its own key, so the earlier choice survives the first save", () => {
    const old = JSON.stringify({ autoApply: false, dailyCap: 3, nudity: true, animals: false });
    const next = mergePreferences(old, parse({}));
    expect(next).toEqual({
      v: PREFERENCES_VERSION,
      merged: true,
      autoApply: false,
      dailyCap: 3,
      contentBoundaries: { nudity: true },
    });
  });

  it("leaves an old default 'no' unset instead of turning it into an answer", () => {
    const old = JSON.stringify({ nudity: false, animals: false });
    const next = mergePreferences(old, parse({}));
    expect(next).toEqual({ v: PREFERENCES_VERSION, merged: true });
    expect(readContentBoundaries(next)).toEqual({ nudity: null });
  });
});

describe("mergeContentBoundaries", () => {
  it("accepts yes, no and no answer, and nothing else", () => {
    expect(ContentBoundariesInput.safeParse({ nudity: true }).success).toBe(true);
    expect(ContentBoundariesInput.safeParse({ nudity: null }).success).toBe(true);
    expect(ContentBoundariesInput.safeParse({}).success).toBe(false);
    expect(ContentBoundariesInput.safeParse({ nudity: "yes" }).success).toBe(false);
  });

  it("stores the answer and keeps job preferences as they were", () => {
    const stored = JSON.stringify({ v: PREFERENCES_VERSION, travel: "national", animals: true });
    const next = mergeContentBoundaries(stored, { nudity: false });
    expect(readContentBoundaries(next)).toEqual({ nudity: false });
    expect(readPreferences(next)).toEqual({ ...unset, travel: "national", animals: true });
  });

  it("clears the answer with null, including one carried over from the old form", () => {
    const old = JSON.stringify({ nudity: true, animals: true });
    const next = mergeContentBoundaries(old, { nudity: null });
    expect(readContentBoundaries(next)).toEqual({ nudity: null });
    expect(next).not.toHaveProperty("nudity");
    expect(next).not.toHaveProperty("contentBoundaries");
    // The old "yes" for animals was a choice and is kept.
    expect(readPreferences(next).animals).toBe(true);
  });

  it("round-trips through JSON the way the column stores it", () => {
    const first = JSON.stringify(mergeContentBoundaries("{}", { nudity: true }));
    const second = JSON.stringify(mergePreferences(first, parse({ workModes: ["remote"] })));
    expect(readContentBoundaries(second)).toEqual({ nudity: true });
    expect(readPreferences(second).workModes).toEqual(["remote"]);
  });
});

describe("round 8: playable age range and the specialty merge", () => {
  it("refuses an age range whose end is below its start", () => {
    expect(PreferencesInput.safeParse({ playableAgeMin: 30, playableAgeMax: 20 }).success).toBe(false);
    expect(parse({ playableAgeMin: 18, playableAgeMax: 25 })).toMatchObject({ playableAgeMin: 18, playableAgeMax: 25 });
  });

  it("merges work types from old specialties until Preferences is saved once", () => {
    expect(readPreferences(null, ["publicite", "figuration", "improv"])).toMatchObject({
      projectTypes: ["commercial"],
      roleTypes: ["background"],
    });
    const saved = mergePreferences(null, parse({ projectTypes: ["film"] }));
    expect(readPreferences(saved, ["publicite"]).projectTypes).toEqual(["film"]);
  });

  it("a content-boundaries save leaves the merge open", () => {
    const next = mergeContentBoundaries(null, { nudity: false });
    expect(next).not.toHaveProperty("merged");
  });
});
