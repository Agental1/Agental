import { describe, expect, it } from "vitest";
import { mandatSignBlocker, type MandatSignState } from "@/domain/mandat";

const today = new Date("2026-11-18T12:00:00Z");

const ready: MandatSignState = {
  stageName: "Ana Lee",
  birthDate: new Date("1995-04-02T00:00:00Z"),
  isMinor: false,
  specialtiesCount: 1,
  mandat: null,
};

const blocker = (patch: Partial<MandatSignState>) =>
  mandatSignBlocker({ ...ready, ...patch }, today);

describe("mandatSignBlocker", () => {
  it("lets a complete adult profile sign", () => {
    expect(mandatSignBlocker(ready, today)).toBeNull();
  });

  it("refuses when there is no profile", () => {
    expect(mandatSignBlocker(null, today)).toBe("errors.profileNotFound");
  });

  it("refuses a short or blank stage name", () => {
    expect(blocker({ stageName: "A" })).toBe("errors.stageNameRequired");
    expect(blocker({ stageName: "   " })).toBe("errors.stageNameRequired");
  });

  it("refuses a missing birth date", () => {
    expect(blocker({ birthDate: null })).toBe("errors.birthDateRequired");
  });

  it("refuses under 18, including at 17 years and 364 days", () => {
    expect(blocker({ birthDate: new Date("2008-11-19T00:00:00Z") })).toBe("errors.adultsOnly");
    expect(blocker({ birthDate: new Date("2008-11-18T00:00:00Z") })).toBeNull();
  });

  it("refuses a profile flagged as a minor whatever its birth date says", () => {
    expect(blocker({ isMinor: true })).toBe("errors.adultsOnly");
  });

  it("refuses a profile with no specialty", () => {
    expect(blocker({ specialtiesCount: 0 })).toBe("errors.specialtyRequired");
  });

  it("refuses a second signature of an active mandate", () => {
    expect(blocker({ mandat: { status: "ACTIVE", signedAt: new Date() } })).toBe(
      "errors.mandatAlreadySigned"
    );
  });

  it("allows signing again after a revocation", () => {
    expect(blocker({ mandat: { status: "REVOKED", signedAt: new Date() } })).toBeNull();
  });
});
