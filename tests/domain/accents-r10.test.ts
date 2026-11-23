import { describe, expect, it } from "vitest";
import { ACCENTS, ACCENT_GROUPS } from "@/domain/accents";

describe("accents list (round 10)", () => {
  it("has no duplicate and covers the new regions", () => {
    expect(new Set(ACCENTS.map((a) => a.toLowerCase())).size).toBe(ACCENTS.length);
    expect(ACCENTS.length).toBeGreaterThan(290);
    for (const region of ["United States", "United Kingdom and Ireland", "Spanish", "Africa", "Oceania", "South Asia", "East and Southeast Asia", "Middle East and North Africa"]) {
      expect(ACCENT_GROUPS.some((g) => g.region === region)).toBe(true);
    }
    expect(ACCENTS).toEqual(expect.arrayContaining(["Pittsburgh", "Geordie", "Paisa", "Yoruba", "Tamil", "Emirati"]));
  });
});
