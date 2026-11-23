import { describe, expect, it } from "vitest";
import { searchBlock, type SearchBlockFacts } from "@/domain/search-block";
import { accountEligibility } from "@/domain/workflow/eligibility";

/** Round 10, group 3: one reason per cause, in the order the performer can act on. */
const ok: SearchBlockFacts = {
  kind: "TALENT",
  accountStatus: "TEST",
  deleted: false,
  isAdult: true,
  emailVerified: true,
  missing: [],
  quota: { limit: 5, remaining: 5, resetsAt: null },
  mode: "staging",
  access: "test_only",
};

describe("searchBlock (round 10)", () => {
  it("lets a verified Test account at 100% search", () => {
    expect(searchBlock(ok)).toBeNull();
  });

  it("names the founder's new account's first blocker: email, then test mode", () => {
    const realUnverified = { ...ok, accountStatus: "UNREVIEWED", emailVerified: false };
    expect(searchBlock(realUnverified)).toEqual({ reason: "email_unverified" });
    expect(searchBlock({ ...realUnverified, emailVerified: true })).toEqual({ reason: "not_open" });
    expect(searchBlock({ ...realUnverified, emailVerified: true, access: "all_verified" })).toBeNull();
  });

  it("lists what is missing from the profile", () => {
    expect(searchBlock({ ...ok, missing: ["build", "phone"] })).toEqual({ reason: "profile_incomplete", missing: ["build", "phone"] });
  });

  it("gives the date of the next search when the allowance is used", () => {
    expect(searchBlock({ ...ok, quota: { limit: 5, remaining: 0, resetsAt: "2026-12-20T00:00:00.000Z" } })).toEqual({
      reason: "quota",
      limit: 5,
      nextDate: "2026-12-20T00:00:00.000Z",
    });
  });

  it("says staff blocked the account, whatever else is true", () => {
    for (const accountStatus of ["SPAM", "REVOKED", "STAFF"]) {
      expect(searchBlock({ ...ok, accountStatus, emailVerified: false })).toEqual({ reason: "blocked" });
    }
    expect(searchBlock({ ...ok, deleted: true })).toEqual({ reason: "blocked" });
    expect(searchBlock({ ...ok, kind: "CASTING" })).toEqual({ reason: "blocked" });
  });

  it("refuses minors and keeps Test accounts out of live", () => {
    expect(searchBlock({ ...ok, isAdult: false })).toEqual({ reason: "not_adult" });
    expect(searchBlock({ ...ok, mode: "live" })).toEqual({ reason: "not_open" });
  });

  it("agrees with the server gate on who may search", () => {
    const account = { accountStatus: "UNREVIEWED", emailVerified: new Date(), isAdult: true, profileComplete: true };
    expect(accountEligibility(account, "staging")).toEqual({ ok: false, reason: "real_account" });
    expect(accountEligibility(account, "staging", "all_verified")).toEqual({ ok: true });
    expect(accountEligibility({ ...account, accountStatus: "TEST" }, "staging", "all_verified")).toEqual({ ok: true });
    expect(accountEligibility({ ...account, accountStatus: "TEST" }, "live", "all_verified")).toEqual({ ok: false, reason: "test_account" });
  });
});
