import { describe, expect, it } from "vitest";
import { cmToFtIn, ftInToCm, heightInBothUnits } from "@/domain/height";
import { kgToLb, lbToKg, weightInBothUnits, weightTextToKg } from "@/domain/weight";

describe("round 8d: both units", () => {
  it("5 ft 10 in is 178 cm and back", () => {
    expect(ftInToCm(5, 10)).toBe(178);
    expect(cmToFtIn(178)).toEqual({ feet: 5, inches: 10 });
    expect(heightInBothUnits(178, "en", "imperial")).toEqual({ main: "5 ft 10 in", other: "178 cm" });
  });

  it("every stored height from 91 to 241 cm survives a round trip through feet and inches within 1 cm", () => {
    for (let cm = 91; cm <= 241; cm++) {
      const { feet, inches } = cmToFtIn(cm);
      expect(Math.abs(ftInToCm(feet, inches) - cm)).toBeLessThanOrEqual(1);
    }
  });

  it("weight converts between lb and kg and is stored in kg", () => {
    expect(kgToLb(73)).toBe(161);
    expect(lbToKg(161)).toBe(73);
    expect(weightTextToKg("161", "lb")).toBe(73);
    expect(weightTextToKg("73", "kg")).toBe(73);
    expect(weightTextToKg("73,4", "kg")).toBe(73);
    expect(weightTextToKg("5", "kg")).toBeUndefined();
    expect(weightInBothUnits(73, "lb")).toEqual({ main: "161 lb", other: "73 kg" });
  });

  it("every stored weight survives a round trip through pounds", () => {
    for (let kg = 20; kg <= 300; kg++) expect(lbToKg(kgToLb(kg))).toBe(kg);
  });
});
