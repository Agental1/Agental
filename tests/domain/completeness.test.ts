import { describe, expect, it } from "vitest";
import {
  hasPhysicalDetails,
  profileGaps,
  scoreProfile,
  type CompletenessInput,
} from "@/domain/completeness";
import { parseJson, PhysicalTraits, toJson, withHeight } from "@/domain/json";
import { GAP_TAB, PROFILE_TABS, parseProfileTab } from "@/domain/profile-tabs";

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
  media: [{ type: "PHOTO" }, { type: "SELFTAPE" }],
};

describe("scoreProfile", () => {
  it("scores a complete profile 100", () => {
    expect(scoreProfile(full)).toBe(100);
  });

  it("gives no physical points for a saved empty form", () => {
    // What the old rule saw as complete: anything other than "{}".
    const saved = parseJson(PhysicalTraits, toJson({ languages: [], accents: [] }));
    expect(hasPhysicalDetails(saved)).toBe(false);
    expect(scoreProfile({ ...full, physical: saved })).toBe(85);
  });

  it("scores a profile fresh from signup well below 100", () => {
    expect(scoreProfile(fresh)).toBe(45);
  });
});

describe("profileGaps", () => {
  it("lists photos, video, physical details and bio after signup", () => {
    expect(profileGaps(fresh)).toEqual(["photos", "video", "physical", "bio"]);
  });

  it("asks for more than a height", () => {
    expect(profileGaps({ ...fresh, physical: { ...empty, heightCm: 170 } })).toContain(
      "physical"
    );
  });

  it("counts a reel or a self-tape as video", () => {
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, { type: "VIDEO" }] })).toEqual([]);
    expect(profileGaps({ ...full, media: [{ type: "PHOTO" }, { type: "AUDIO" }] })).toEqual([
      "video",
    ]);
  });

  it("treats a blank bio as missing", () => {
    expect(profileGaps({ ...full, bio: "   " })).toEqual(["bio"]);
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
});
