import { describe, expect, it } from "vitest";
import { EYE_COLORS, HAIR_COLORS, HAIR_LENGTHS, matchOption, optionKey } from "@/domain/identity";
import { ProfileIdentity, ProfilePhysical, BIO_MAX } from "@/domain/profile";

describe("matchOption (round 8 hair and eye lists)", () => {
  it("maps certain spellings and keeps the rest as typed", () => {
    expect(matchOption(HAIR_COLORS, "  dark   BROWN ")).toBe("Dark brown");
    expect(matchOption(HAIR_COLORS, "blonde")).toBe("Blond");
    expect(matchOption(EYE_COLORS, "grey")).toBe("Gray");
    expect(matchOption(EYE_COLORS, "bleus")).toBe("Blue");
    expect(matchOption(HAIR_COLORS, "brown with highlights")).toBeNull();
    expect(matchOption(HAIR_LENGTHS, "")).toBeNull();
  });

  it("gives every option a message key", () => {
    expect(optionKey("Salt and pepper")).toBe("salt_and_pepper");
    expect(optionKey("Bald or shaved")).toBe("bald_or_shaved");
  });
});

describe("ProfileIdentity (round 8)", () => {
  const base = { birthDate: "1995-04-02" };
  it("accepts an empty stage name and a 5,000-character bio", () => {
    const r = ProfileIdentity.safeParse({ ...base, stageName: "", bio: "a".repeat(BIO_MAX) });
    expect(r.success).toBe(true);
  });
  it("refuses a bio over the limit and an unknown gender", () => {
    expect(ProfileIdentity.safeParse({ ...base, bio: "a".repeat(BIO_MAX + 1) }).success).toBe(false);
    expect(ProfileIdentity.safeParse({ ...base, gender: "robot" }).success).toBe(false);
  });
});

describe("ProfilePhysical patch", () => {
  it("leaves languages and accents out unless sent", () => {
    const r = ProfilePhysical.parse({ hair: "Black" });
    expect("languages" in r && r.languages !== undefined).toBe(false);
  });
  it("marks an emptied height for clearing", () => {
    const r = ProfilePhysical.parse({ height: null }) as { clearHeight?: boolean };
    expect(r.clearHeight).toBe(true);
  });
});
