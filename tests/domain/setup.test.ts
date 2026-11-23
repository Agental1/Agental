import { describe, expect, it } from "vitest";
import { isSetupComplete, nextSetupStep } from "@/domain/setup";

/**
 * Round 10: the sign-up questions are the profile's own fields. The dashboard
 * card, the wizard's resume point and the routing after sign-in all read this
 * one rule, so each boundary is pinned here.
 */
const today = new Date("2026-11-19T12:00:00Z");
const adult = new Date("1995-04-02T00:00:00Z");
const done = { legalFirstName: "Maya", legalLastName: "Okafor", birthDate: adult, gender: "female" };
const empty = { legalFirstName: null, legalLastName: null, birthDate: null, gender: null };

describe("nextSetupStep (round 10)", () => {
  it("starts at identity when nothing was saved", () => {
    expect(nextSetupStep(null, today)).toBe("identity");
    expect(nextSetupStep(undefined, today)).toBe("identity");
    expect(nextSetupStep(empty, today)).toBe("identity");
  });

  it("keeps identity open until both legal names are there (the older single field counts)", () => {
    expect(nextSetupStep({ ...done, legalLastName: " " }, today)).toBe("identity");
    expect(nextSetupStep({ ...done, legalFirstName: null, legalLastName: null, legalName: "Maya Okafor" }, today)).toBe(null);
  });

  it("then asks for an adult date of birth and a gender", () => {
    expect(nextSetupStep({ ...done, birthDate: null }, today)).toBe("profile");
    expect(nextSetupStep({ ...done, birthDate: new Date("2008-11-20T00:00:00Z") }, today)).toBe("profile");
    expect(nextSetupStep({ ...done, birthDate: new Date("2008-11-19T00:00:00Z") }, today)).toBe(null);
    expect(nextSetupStep({ ...done, gender: "" }, today)).toBe("profile");
  });

  it("is finished with the two steps: no city, no agreement", () => {
    expect(nextSetupStep(done, today)).toBeNull();
    expect(isSetupComplete(done, today)).toBe(true);
  });
});
