import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IdentityStep, MandatStep, ProfileBasicsStep } from "@/domain/onboarding";
import { ProfileIdentity, ProfilePhysical } from "@/domain/profile";
import { zodError } from "@/domain/action-result";
import type { z } from "zod";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const keyOf = (r: { success: boolean; error?: z.ZodError }) =>
  r.error ? zodError(r.error).key : null;

describe("IdentityStep", () => {
  const base = { stageName: "Ana Lee", birthDate: "1995-04-02" };

  it("accepts a stage name and an adult birth date, city optional", () => {
    const parsed = IdentityStep.parse({ ...base, stageName: "  Ana Lee " });
    expect(parsed.stageName).toBe("Ana Lee");
    expect(parsed.city).toBeUndefined();
  });

  it("requires a stage name of two characters after trimming", () => {
    expect(keyOf(IdentityStep.safeParse({ ...base, stageName: " A " }))).toBe(
      "errors.stageNameRequired"
    );
  });

  it("requires the birth date", () => {
    expect(keyOf(IdentityStep.safeParse({ stageName: "Ana" }))).toBe("errors.birthDateRequired");
    expect(keyOf(IdentityStep.safeParse({ ...base, birthDate: "" }))).toBe(
      "errors.birthDateRequired"
    );
  });

  it("refuses under 18 with errors.adultsOnly", () => {
    expect(keyOf(IdentityStep.safeParse({ ...base, birthDate: "2008-11-19" }))).toBe(
      "errors.adultsOnly"
    );
    expect(IdentityStep.safeParse({ ...base, birthDate: "2008-11-18" }).success).toBe(true);
  });

  it("refuses an impossible date", () => {
    expect(keyOf(IdentityStep.safeParse({ ...base, birthDate: "1995-02-30" }))).toBe(
      "errors.birthDateInvalid"
    );
  });

  it("applies the same rule in the profile editor", () => {
    expect(
      keyOf(ProfileIdentity.safeParse({ ...base, birthDate: "2010-01-01", bio: "" }))
    ).toBe("errors.adultsOnly");
  });
});

describe("ProfileBasicsStep", () => {
  it("requires at least one specialty", () => {
    expect(keyOf(ProfileBasicsStep.safeParse({ specialties: [] }))).toBe(
      "errors.specialtyRequired"
    );
  });

  it("refuses unknown specialties", () => {
    expect(ProfileBasicsStep.safeParse({ specialties: ["astronaut"] }).success).toBe(false);
  });

  it("deduplicates specialties", () => {
    expect(
      ProfileBasicsStep.parse({ specialties: ["photo", "photo", "voix"] }).specialties
    ).toEqual(["photo", "voix"]);
  });

  it("leaves the height undefined when it is not given", () => {
    expect(ProfileBasicsStep.parse({ specialties: ["photo"] }).height).toBeUndefined();
  });

  it("turns feet and inches into centimeters", () => {
    expect(
      ProfileBasicsStep.parse({
        specialties: ["photo"],
        height: { unit: "imperial", feet: 5, inches: 10 },
      }).height
    ).toBe(178);
  });

  it("refuses an out-of-range height with its key", () => {
    expect(
      keyOf(
        ProfileBasicsStep.safeParse({
          specialties: ["photo"],
          height: { unit: "metric", cm: 300 },
        })
      )
    ).toBe("errors.heightRange");
  });
});

describe("MandatStep", () => {
  it("needs an explicit acceptance", () => {
    expect(MandatStep.safeParse({ accept: true }).success).toBe(true);
    expect(keyOf(MandatStep.safeParse({ accept: false }))).toBe("errors.mandatRequired");
    expect(keyOf(MandatStep.safeParse({}))).toBe("errors.mandatRequired");
  });
});

describe("ProfilePhysical", () => {
  it("stores the height as heightCm and keeps the other traits", () => {
    expect(
      ProfilePhysical.parse({
        height: { unit: "imperial", feet: 5, inches: 7 },
        hair: "brown",
      })
    ).toEqual({ heightCm: 170, clearHeight: false, hair: "brown" });
  });

  it("omits heightCm when the height is blank", () => {
    expect(ProfilePhysical.parse({ eyes: "green" })).not.toHaveProperty("heightCm");
  });
});
