import { describe, expect, it } from "vitest";
import { LANGUAGE_ORDER, languageMatches, knownLanguage } from "@/domain/languages";
import { ACCENTS, accentMatches } from "@/domain/accents";

describe("languages (round 8)", () => {
  it("pins English, Mandarin, Spanish, French, then the rest A to Z", () => {
    expect(LANGUAGE_ORDER.slice(0, 4).map((l) => l.name)).toEqual(["English", "Mandarin", "Spanish", "French"]);
    const rest = LANGUAGE_ORDER.slice(4).map((l) => l.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect(LANGUAGE_ORDER.some((l) => l.name === "Cantonese")).toBe(true);
  });
  it("matches codes and names", () => {
    const find = (q: string) => LANGUAGE_ORDER.filter((l) => languageMatches(l, q)).map((l) => l.name);
    expect(find("FR")[0]).toBe("French");
    expect(find("zh")).toContain("Mandarin");
    expect(find("EN")).toContain("English");
    expect(find("es")).toContain("Spanish");
  });
  it("reads older free text when certain", () => {
    expect(knownLanguage("chinese")).toBe("Mandarin");
    expect(knownLanguage("french")).toBe("French");
    expect(knownLanguage("elvish")).toBeNull();
  });
});

describe("accents (round 8)", () => {
  it("finds by any word", () => {
    expect(ACCENTS.filter((a) => accentMatches(a, "Leb"))).toEqual(["Lebanese"]);
    expect(ACCENTS.filter((a) => accentMatches(a, "rp"))).toContain("Received Pronunciation (RP)");
  });
});
