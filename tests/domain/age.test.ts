import { describe, expect, it } from "vitest";
import { ageOn, birthDateError, isAdult, isMinorOn, isoDate } from "@/domain/age";

const at = (iso: string) => new Date(iso);

describe("ageOn", () => {
  it("counts full years in UTC calendar dates", () => {
    expect(ageOn("2000-06-15", at("2026-06-14T12:00:00Z"))).toBe(25);
    expect(ageOn("2000-06-15", at("2026-06-15T00:00:00Z"))).toBe(26);
  });

  it("ignores the hour: 23:59 UTC on the day before is still the day before", () => {
    expect(ageOn("2008-11-19", at("2026-11-18T23:59:59Z"))).toBe(17);
    expect(ageOn("2008-11-19", at("2026-11-19T00:00:00Z"))).toBe(18);
  });

  it("accepts a stored Date (midnight UTC)", () => {
    expect(ageOn(new Date("2008-11-18T00:00:00Z"), at("2026-11-18T08:00:00Z"))).toBe(18);
  });

  it("turns a 29 February birthday over on 1 March in common years", () => {
    expect(ageOn("2008-02-29", at("2026-02-28T12:00:00Z"))).toBe(17);
    expect(ageOn("2008-02-29", at("2026-03-01T12:00:00Z"))).toBe(18);
  });

  it("refuses unreadable and impossible dates", () => {
    expect(ageOn("2023-02-30")).toBeNull();
    expect(ageOn("15/06/2000")).toBeNull();
    expect(ageOn("")).toBeNull();
    expect(ageOn(new Date("nope"))).toBeNull();
  });
});

describe("isAdult / isMinorOn", () => {
  const today = at("2026-11-18T10:00:00Z");

  it("is an adult on the 18th birthday itself", () => {
    expect(isAdult("2008-11-18", today)).toBe(true);
    expect(isMinorOn("2008-11-18", today)).toBe(false);
  });

  it("is a minor at 17 years and 364 days", () => {
    expect(isAdult("2008-11-19", today)).toBe(false);
    expect(isMinorOn("2008-11-19", today)).toBe(true);
  });

  it("never calls a missing date adult, nor a minor", () => {
    expect(isAdult(null, today)).toBe(false);
    expect(isAdult(undefined, today)).toBe(false);
    expect(isMinorOn(null, today)).toBe(false);
  });
});

describe("birthDateError", () => {
  const today = at("2026-11-18T10:00:00Z");

  it("returns null for an adult", () => {
    expect(birthDateError("1990-01-01", today)).toBeNull();
    expect(birthDateError("2008-11-18", today)).toBeNull();
  });

  it("asks for a missing date", () => {
    expect(birthDateError("", today)).toBe("errors.birthDateRequired");
    expect(birthDateError("  ", today)).toBe("errors.birthDateRequired");
    expect(birthDateError(undefined, today)).toBe("errors.birthDateRequired");
  });

  it("refuses unreadable, future and implausibly old dates", () => {
    expect(birthDateError("2023-02-30", today)).toBe("errors.birthDateInvalid");
    expect(birthDateError("2026-11-19", today)).toBe("errors.birthDateInvalid");
    expect(birthDateError("1800-01-01", today)).toBe("errors.birthDateInvalid");
  });

  it("refuses under 18 with the adults-only key", () => {
    expect(birthDateError("2008-11-19", today)).toBe("errors.adultsOnly");
    expect(birthDateError("2026-11-18", today)).toBe("errors.adultsOnly");
  });
});

describe("isoDate", () => {
  it("is the UTC calendar date", () => {
    expect(isoDate(at("2026-11-18T23:30:00-08:00"))).toBe("2026-11-19");
  });
});
