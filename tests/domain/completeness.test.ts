import { describe, expect, it } from "vitest";
import {
  hasPhysicalDetails,
  profileGaps,
  scoreProfile,
  nextMissingItem,
  type CompletenessInput,
} from "@/domain/completeness";
import { parseJson, PhysicalTraits, toJson, withHeight } from "@/domain/json";
import {
  GAP_TAB,
  ITEM_TARGET,
  PROFILE_TABS,
  itemHref,
  parseProfileFocus,
  parseProfileTab,
} from "@/domain/profile-tabs";

const empty = parseJson(PhysicalTraits, null);

const fresh: CompletenessInput = {
  stageName: "Ana Lee",
  birthDate: new Date("1995-04-02T00:00:00Z"),
  city: null,
  bio: null,
  physical: empty,
  specialtiesCount: 1,
  media: [],
};

const full: CompletenessInput = {
  ...fresh,
  city: "Los Angeles",
  bio: "Trained at a conservatory.",
  physical: { ...empty, heightCm: 170, hair: "brown" },
  media: [
    { type: "PHOTO" },
    { type: "SELFTAPE" },
    { type: "PHOTO", category: "PRODUCTIONS" },
    { type: "AUDIO" },
  ],
  imdbUrl: "https://www.imdb.com/name/nm1234567/",
  portfolioUrl: "https://ana.example.com/",
};

describe("scoreProfile", () => {
  it("scores a complete profile 100", () => {
    expect(scoreProfile(full)).toBe(100);
  });

  it("gives no physical points for a saved empty form", () => {
    // What the old rule saw as complete: anything other than "{}".
    const saved = parseJson(PhysicalTraits, toJson({ languages: [], accents: [] }));
    expect(hasPhysicalDetails(saved)).toBe(false);
    expect(scoreProfile({ ...full, physical: saved })).toBe(88);
  });

  it("scores a profile fresh from signup well below 100", () => {
    expect(scoreProfile(fresh)).toBe(40);
  });
});

describe("profileGaps", () => {
  it("lists photos, video, physical details and bio after signup", () => {
    expect(profileGaps(fresh)).toEqual(["photos", "video", "physical", "bio", "links", "productions", "otherMedia"]);
  });

  it("asks for more than a height", () => {
    expect(profileGaps({ ...fresh, physical: { ...empty, heightCm: 170 } })).toContain(
      "physical"
    );
  });

  it("counts a reel or a self-tape as video", () => {
    const rest = [{ type: "PHOTO", category: "PRODUCTIONS" }, { type: "AUDIO" }];
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, { type: "VIDEO" }, ...rest] })).toEqual([]);
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, ...rest] })).toEqual(["video"]);
  });

  it("counts each media category", () => {
    // A production still is not a photo of yourself, and a reel moved to
    // Other is not a general video.
    expect(profileGaps({ ...full, media: [{ type: "PHOTO", category: "PRODUCTIONS" }, { type: "SELFTAPE" }, { type: "AUDIO" }] })).toEqual(["photos"]);
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, { type: "SELFTAPE" }, { type: "AUDIO" }] })).toEqual(["productions"]);
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, { type: "SELFTAPE" }, { type: "PHOTO", category: "PRODUCTIONS" }] })).toEqual(["otherMedia"]);
    expect(scoreProfile({ ...full, media: [{ type: "PHOTO" }, { type: "SELFTAPE" }] })).toBe(94);
  });

  it("treats a blank bio as missing", () => {
    expect(profileGaps({ ...full, bio: "   " })).toEqual(["bio"]);
  });
});

describe("profile links", () => {
  it("count twelve points together, and either one clears the gap", () => {
    // One link is enough for 100%: the score and the gap use the same rule.
    expect(scoreProfile({ ...full, portfolioUrl: null })).toBe(100);
    expect(scoreProfile({ ...full, imdbUrl: null })).toBe(100);
    expect(scoreProfile({ ...full, imdbUrl: null, portfolioUrl: null })).toBe(88);
    expect(profileGaps({ ...full, imdbUrl: null })).toEqual([]);
    expect(profileGaps({ ...full, imdbUrl: null, portfolioUrl: null })).toEqual(["links"]);
  });

  it("names the next missing item", () => {
    expect(nextMissingItem(fresh)).toBe("photos");
    expect(itemHref("productions")).toBe("/talents/app/profil?tab=medias&focus=media-PRODUCTIONS");
    expect(nextMissingItem(full)).toBeNull();
    expect(nextMissingItem({ ...full, city: null })).toBe("city");
    expect(nextMissingItem({ ...full, imdbUrl: null, portfolioUrl: null })).toBe("links");
  });

  it("never asks for something already filled in", () => {
    const base = full;
    // A saved height is not asked for again: the hair, eyes or build is.
    expect(nextMissingItem({ ...base, physical: { ...empty, heightCm: 170 } })).toBe("physical");
    expect(nextMissingItem({ ...base, physical: empty })).toBe("height");
    expect(nextMissingItem({ ...fresh, birthDate: null })).toBe("birthDate");
    expect(nextMissingItem({ ...fresh, stageName: " " })).toBe("stageName");
    expect(nextMissingItem({ ...fresh, specialtiesCount: 0 })).toBe("specialties");
    expect(nextMissingItem({ ...full, media: full.media.filter((m) => m.type !== "SELFTAPE") })).toBe("video");
  });

  it("agrees with the score: nothing missing exactly at 100", () => {
    const cases = [fresh, full, { ...full, city: null }, { ...full, portfolioUrl: null }, { ...full, bio: "" }];
    for (const c of cases) expect(nextMissingItem(c) === null).toBe(scoreProfile(c) === 100);
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
