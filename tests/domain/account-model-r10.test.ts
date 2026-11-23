import { describe, expect, it } from "vitest";
import { accountType, effectiveStatus, isTestAccount } from "@/domain/account-model";
import { consentChoiceOf, weekStartOf } from "@/domain/consent-choice";

const performer = { kind: "TALENT", isStaff: false, isAdmin: false, accountStatus: "UNREVIEWED" };

describe("account model (round 10)", () => {
  it("has three types; Staff wins over the kind", () => {
    expect(accountType(performer)).toBe("PERFORMER");
    expect(accountType({ ...performer, kind: "CASTING" })).toBe("CASTING");
    expect(accountType({ ...performer, isStaff: true })).toBe("STAFF");
    expect(accountType({ ...performer, isAdmin: true })).toBe("STAFF");
    expect(accountType({ ...performer, accountStatus: "STAFF" })).toBe("STAFF");
  });

  it("keeps Test a flag, never a type", () => {
    const founderTest = { ...performer, isStaff: true, accountStatus: "TEST" };
    expect(accountType(founderTest)).toBe("STAFF");
    expect(isTestAccount(founderTest)).toBe(true);
    // A Staff account marked Test searches like a Test account; Staff alone never.
    expect(effectiveStatus(founderTest)).toBe("TEST");
    expect(effectiveStatus({ ...performer, isStaff: true })).toBe("STAFF");
    expect(effectiveStatus(performer)).toBe("UNREVIEWED");
  });

  it("names the cookie choice and the week it falls in", () => {
    expect(consentChoiceOf({ consentAnalytics: true, consentMarketing: true })).toBe("accepted_all");
    expect(consentChoiceOf({ consentAnalytics: false, consentMarketing: false })).toBe("rejected");
    expect(consentChoiceOf({ consentAnalytics: true, consentMarketing: false })).toBe("custom");
    expect(consentChoiceOf({ consentAnalytics: null, consentMarketing: null })).toBe("none");
    expect(weekStartOf(new Date("2026-11-23T09:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(weekStartOf(new Date("2026-11-29T23:00:00Z")).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
});
