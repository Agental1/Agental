import { describe, expect, it, vi } from "vitest";
import { agentsEnabled, refusalKey, workflowEligibility, workflowMode } from "@/domain/workflow/eligibility";
import { loadProfileFacts } from "@/lib/workflow/profiles";

/**
 * Who a workflow run may touch. The owner's test accounts must never receive
 * real casting research or a workflow email, a real performer must never be
 * used for a demonstration, and an account nobody has classified must never
 * run at all. The check sits on the server, before a profile is read.
 */
const verified = new Date("2026-11-01T00:00:00Z");
const account = (over: Record<string, unknown> = {}) => ({
  accountStatus: "TEST",
  emailVerified: verified,
  isAdult: true,
  profileComplete: true,
  optedIn: true as boolean | "clicking",
  ...over,
});

describe("workflowMode", () => {
  it("is staging unless the variable says exactly live", () => {
    expect(workflowMode({})).toBe("staging");
    expect(workflowMode({ WORKFLOW_MODE: "" })).toBe("staging");
    expect(workflowMode({ WORKFLOW_MODE: "Live" })).toBe("staging");
    expect(workflowMode({ WORKFLOW_MODE: "production" })).toBe("staging");
    expect(workflowMode({ WORKFLOW_MODE: " live " })).toBe("live");
  });
});

describe("workflowEligibility", () => {
  it("staging takes test accounts and nobody else", () => {
    expect(workflowEligibility(account(), "staging")).toEqual({ ok: true });
    expect(workflowEligibility(account({ accountStatus: "APPROVED" }), "staging")).toEqual({
      ok: false,
      reason: "real_account",
    });
  });

  it("live takes real accounts on their own, and never a test account", () => {
    // No manual approval: a verified, complete account is eligible.
    expect(workflowEligibility(account({ accountStatus: "UNREVIEWED" }), "live")).toEqual({ ok: true });
    expect(workflowEligibility(account({ accountStatus: "APPROVED" }), "live")).toEqual({ ok: true });
    expect(workflowEligibility(account({ accountStatus: "TEST" }), "live")).toEqual({
      ok: false,
      reason: "test_account",
    });
  });

  it("keeps real accounts out of staging", () => {
    expect(workflowEligibility(account({ accountStatus: "UNREVIEWED" }), "staging")).toEqual({
      ok: false,
      reason: "real_account",
    });
  });

  it.each(["staging", "live"] as const)("needs a 100%% profile and no revocation in %s", (mode) => {
    const accountStatus = mode === "live" ? "UNREVIEWED" : "TEST";
    expect(workflowEligibility(account({ accountStatus, profileComplete: false }), mode)).toEqual({
      ok: false,
      reason: "profile_incomplete",
    });
    expect(workflowEligibility(account({ accountStatus: "REVOKED" }), mode)).toEqual({ ok: false, reason: "revoked" });
  });

  it.each(["staging", "live"] as const)("refuses an unknown status in %s", (mode) => {
    for (const accountStatus of ["", null, undefined, "approved", "ADMIN", "ELIGIBLE"]) {
      expect(workflowEligibility(account({ accountStatus }), mode)).toEqual({
        ok: false,
        reason: "unreviewed",
      });
    }
  });

  it.each(["staging", "live"] as const)("refuses spam and staff accounts in %s", (mode) => {
    expect(workflowEligibility(account({ accountStatus: "SPAM" }), mode)).toEqual({ ok: false, reason: "spam" });
    expect(workflowEligibility(account({ accountStatus: "STAFF" }), mode)).toEqual({ ok: false, reason: "staff" });
  });

  it.each(["staging", "live"] as const)("needs a verified email and an adult in %s", (mode) => {
    const accountStatus = mode === "live" ? "APPROVED" : "TEST";
    expect(workflowEligibility(account({ accountStatus, emailVerified: null }), mode)).toEqual({
      ok: false,
      reason: "email_unverified",
    });
    expect(workflowEligibility(account({ accountStatus, isAdult: false }), mode)).toEqual({
      ok: false,
      reason: "not_adult",
    });
  });

  it("needs the opt-in, and the click itself is one", () => {
    const facts = account({ accountStatus: "APPROVED", optedIn: false });
    expect(workflowEligibility(facts, "live")).toEqual({ ok: false, reason: "not_opted_in" });
    expect(agentsEnabled(facts, "live")).toBe(false);
    expect(workflowEligibility({ ...facts, optedIn: "clicking" }, "live")).toEqual({ ok: true });
    expect(agentsEnabled({ ...facts, optedIn: true }, "live")).toBe(true);
  });

  it("checks the account before the opt-in, so the reason a performer sees is the real one", () => {
    expect(workflowEligibility(account({ accountStatus: "UNREVIEWED", optedIn: false, profileComplete: false }), "live")).toEqual({
      ok: false,
      reason: "profile_incomplete",
    });
  });

  it("maps refusals to translation keys", () => {
    expect(refusalKey("email_unverified")).toBe("errors.agentsEmailUnverified");
    expect(refusalKey("unreviewed")).toBe("errors.agentsUnavailable");
    expect(refusalKey("profile_incomplete")).toBe("errors.agentsProfileIncomplete");
    for (const r of ["spam", "staff", "test_account", "real_account", "not_adult", "not_opted_in", "revoked"] as const) {
      expect(refusalKey(r)).toBe("errors.agentsUnavailable");
    }
  });
});

describe("loadProfileFacts", () => {
  const row = (id: string, user: Record<string, unknown> | null) => ({
    id,
    birthDate: new Date("1990-05-01T00:00:00Z"),
    isMinor: false,
    city: "Los Angeles",
    physical: '{"heightCm":170,"hair":"Brown","eyes":"Green","languages":["English"],"accents":[]}',
    // Round 8 required fields.
    legalFirstName: "Ana",
    legalLastName: "Lee",
    legalName: null,
    gender: "female",
    phone: "+12132227981",
    stageName: "Ana Lee",
    bio: "Trained actor.",
    imdbUrl: "https://www.imdb.com/name/nm1/",
    portfolioUrl: null,
    media: [{ type: "PHOTO", category: "SELF" }, { type: "VIDEO", category: "VIDEOS" }, { type: "PHOTO", category: "PRODUCTIONS" }, { type: "AUDIO", category: "OTHER" }],
    _count: { specialties: 1 },
    preferences: '{"v":2,"merged":true,"projectTypes":["film"],"playableAgeMin":20,"playableAgeMax":30,"compensation":"paid_or_unpaid"}',
    mobilityCountries: '["US"]',
    minRateCents: null,
    user: user && { passwordHash: "x", accounts: [], ...user },
    specialties: [],
    availability: [],
  });
  const rows = [
    row("test", { id: "u1", emailVerified: verified, accountStatus: "TEST", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("real", { id: "u2", emailVerified: verified, accountStatus: "APPROVED", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("unreviewed", { id: "u3", emailVerified: verified, accountStatus: "UNREVIEWED", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("unverified-test", { id: "u4", emailVerified: null, accountStatus: "TEST", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("unverified-real", { id: "u5", emailVerified: null, accountStatus: "APPROVED", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("excluded", { id: "u6", emailVerified: verified, accountStatus: "SPAM", agentsOptInAt: verified, autoSearchOptIn: false }),
    row("not-opted-in", { id: "u7", emailVerified: verified, accountStatus: "TEST", agentsOptInAt: null, autoSearchOptIn: false }),
    row("six-hour", { id: "u8", emailVerified: verified, accountStatus: "TEST", agentsOptInAt: null, autoSearchOptIn: true }),
    // An older Google account: no password, no emailVerified stamp. Same rule as the click gate.
    row("google", { id: "u9", emailVerified: null, passwordHash: null, accounts: [{ provider: "google" }], accountStatus: "TEST", agentsOptInAt: verified, autoSearchOptIn: false }),
  ];
  const ids = rows.map((r) => r.id);
  const db = { artistProfile: { findMany: vi.fn(async () => rows) } } as never;
  const now = new Date("2026-11-19T12:00:00Z");

  it("runs only the test account in staging, which is the default", async () => {
    const loaded = await loadProfileFacts(db, ids, now);
    expect(loaded.profiles.map((p) => p.profileId)).toEqual(["test", "six-hour", "google"]);
    expect(loaded.skipped).toBe(6);
  });

  it("runs only the verified, complete real accounts in live", async () => {
    const loaded = await loadProfileFacts(db, ids, now, "live");
    expect(loaded.profiles.map((p) => p.profileId)).toEqual(["real", "unreviewed"]);
    expect(loaded.skipped).toBe(7);
  });

  it("reports how many were left out, never who", async () => {
    const loaded = await loadProfileFacts(db, ids, now);
    expect(Object.keys(loaded).sort()).toEqual(["profiles", "skipped"]);
  });
});
