import { describe, expect, it } from "vitest";
import {
  REQUIRED_ITEMS,
  completenessInputOf,
  legalNameParts,
  missingItems,
  nextMissingItem,
  profileGaps,
  scoreProfile,
  type CompletenessInput,
} from "@/domain/completeness";
import { parseJson, PhysicalTraits, withHeight } from "@/domain/json";
import { readPreferences } from "@/domain/preferences";
import {
  GAP_TAB,
  ITEM_TARGET,
  PROFILE_TABS,
  itemHref,
  parseProfileFocus,
  parseProfileTab,
} from "@/domain/profile-tabs";

const empty = parseJson(PhysicalTraits, null);
const noPrefs = readPreferences(null);

const fresh: CompletenessInput = {
  legalFirstName: null,
  legalLastName: null,
  stageName: "Ana Lee",
  birthDate: new Date("1995-04-02T00:00:00Z"),
  gender: null,
  city: null,
  phone: null,
  bio: null,
  physical: empty,
  media: [],
  preferences: noPrefs,
  minRateCents: null,
};

/** Every required field filled, nothing optional (round 8 rule). */
const full: CompletenessInput = {
  ...fresh,
  stageName: "",
  legalFirstName: "Ana",
  legalLastName: "Lee",
  gender: "female",
  city: "Los Angeles",
  phone: "+12132227981",
  bio: "Trained at a conservatory.",
  physical: { ...empty, heightCm: 170, build: "Athletic", hair: "Brown", eyes: "Green", languages: ["English"] },
  media: [{ type: "PHOTO", category: "SELF" }],
  preferences: { ...noPrefs, projectTypes: ["film"], playableAgeMin: 18, playableAgeMax: 25, compensation: "paid_or_unpaid" },
};

describe("scoreProfile (round 8: required fields only)", () => {
  it("is 100 with every required field and no optional one", () => {
    expect(scoreProfile(full)).toBe(100);
    expect(missingItems(full)).toEqual([]);
  });

  it("does not need IMDb, a portfolio or videos (founders' decision)", () => {
    expect(profileGaps(full)).toEqual(expect.arrayContaining(["video", "links", "productions", "otherMedia", "stageName"]));
    expect(scoreProfile(full)).toBe(100);
  });

  it("drops below 100 for each required field, one at a time", () => {
    const without: Partial<Record<(typeof REQUIRED_ITEMS)[number], Partial<CompletenessInput>>> = {
      legalName: { legalLastName: null },
      birthDate: { birthDate: null },
      gender: { gender: "" },
      city: { city: " " },
      phone: { phone: null },
      bio: { bio: "" },
      languages: { physical: { ...full.physical, languages: [] } },
      height: { physical: { ...full.physical, heightCm: undefined } },
      build: { physical: { ...full.physical, build: "" } },
      hair: { physical: { ...full.physical, hair: undefined } },
      eyes: { physical: { ...full.physical, eyes: "" } },
      photos: { media: [{ type: "VIDEO", category: "SELF" }] },
      workTypes: { preferences: { ...full.preferences, projectTypes: [], roleTypes: [] } },
      ageRange: { preferences: { ...full.preferences, playableAgeMax: null } },
      compensation: { preferences: { ...full.preferences, compensation: null } },
    };
    for (const [item, patch] of Object.entries(without)) {
      const p = { ...full, ...patch };
      expect(scoreProfile(p), item).toBeLessThan(100);
      expect(nextMissingItem(p), item).toBe(item);
    }
  });

  it("asks for the day rate only with paid work only", () => {
    const paid = { ...full, preferences: { ...full.preferences, compensation: "paid_only" as const } };
    expect(missingItems(paid)).toEqual(["dayRate"]);
    expect(scoreProfile({ ...paid, minRateCents: 25000 })).toBe(100);
  });

  it("scores a profile fresh from signup well below 100", () => {
    expect(scoreProfile(fresh)).toBeLessThan(20);
    expect(missingItems(fresh)[0]).toBe("legalName");
  });

  it("reads the older single legal name", () => {
    expect(legalNameParts({ legalFirstName: null, legalLastName: null, legalName: "Ana Maria Lee" })).toEqual({ first: "Ana", last: "Maria Lee" });
    expect(missingItems({ ...full, legalFirstName: null, legalLastName: null, legalName: "Ana Lee" })).toEqual([]);
    expect(missingItems({ ...full, legalFirstName: null, legalLastName: null, legalName: "Ana" })).toEqual(["legalName"]);
  });

  it("counts work types from the old specialties until Preferences is saved", () => {
    const row = {
      legalFirstName: "Ana", legalLastName: "Lee", legalName: null, stageName: "", birthDate: full.birthDate,
      gender: "female", city: "LA", phone: "1", bio: "b", minRateCents: null, imdbUrl: null, portfolioUrl: null,
      physical: JSON.stringify(full.physical),
      preferences: JSON.stringify({ playableAgeMin: 20, playableAgeMax: 30, compensation: "paid_or_unpaid" }),
      media: [{ type: "PHOTO", category: "SELF" }],
      specialties: [{ kind: "publicite" }],
    };
    expect(completenessInputOf(row).preferences.projectTypes).toEqual(["commercial"]);
    expect(scoreProfile(completenessInputOf(row))).toBe(100);
    const saved = { ...row, preferences: JSON.stringify({ merged: true, playableAgeMin: 20, playableAgeMax: 30, compensation: "paid_or_unpaid" }) };
    expect(missingItems(completenessInputOf(saved))).toEqual(["workTypes"]);
  });
});

describe("withHeight", () => {
  const stored = { ...empty, hair: "brown", languages: ["English"] };

  it("sets the height and keeps the other traits", () => {
    expect(withHeight(stored, 180)).toEqual({ ...stored, heightCm: 180 });
  });

  it("clears only the height when it is blank", () => {
    expect(withHeight({ ...stored, heightCm: 170 }, undefined)).toEqual(stored);
  });
});

describe("parseProfileTab", () => {
  it("accepts every real tab id", () => {
    for (const tab of PROFILE_TABS) expect(parseProfileTab(tab)).toBe(tab);
  });

  it("falls back to identity for anything else", () => {
    expect(parseProfileTab(undefined)).toBe("identite");
    expect(parseProfileTab("../admin")).toBe("identite");
    expect(parseProfileTab("toString")).toBe("identite");
    expect(parseProfileTab(["medias", "physique"])).toBe("medias");
  });

  it("sends the old Specialties tab to Preferences", () => {
    expect(parseProfileTab("specialites")).toBe("preferences");
  });

  it("deep links every gap to a real tab", () => {
    for (const tab of Object.values(GAP_TAB)) expect(PROFILE_TABS).toContain(tab);
  });

  it("opens the exact field for every missing item", () => {
    for (const { tab } of Object.values(ITEM_TARGET)) expect(PROFILE_TABS).toContain(tab);
    expect(itemHref("birthDate")).toBe("/talents/app/profil?tab=identite&focus=birthDate");
    expect(parseProfileFocus("birthDate")).toBe("birthDate");
    expect(parseProfileFocus("<script>")).toBeUndefined();
  });
});
