import { describe, expect, it, vi } from "vitest";
import { workflowEligibility, workflowMode } from "@/domain/workflow/eligibility";
import { loadProfileFacts } from "@/lib/workflow/profiles";

/**
 * Who a workflow run may touch. The owner's test accounts must never receive
 * real casting research or a workflow email, a real performer must never be
 * used for a demonstration, and an account nobody has classified must never
 * run at all. The check sits on the server, before a profile is read.
 */
const verified = new Date("2026-11-01T00:00:00Z");
const account = (over: Record<string, unknown> = {}) => ({
  workflowAccess: "TEST",
  emailVerified: verified,
  isAdult: true,
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
    expect(workflowEligibility(account({ workflowAccess: "ELIGIBLE" }), "staging")).toEqual({
      ok: false,
      reason: "real_account",
    });
  });

  it("live takes reviewed performers and never a test account", () => {
    expect(workflowEligibility(account({ workflowAccess: "ELIGIBLE" }), "live")).toEqual({ ok: true });
    expect(workflowEligibility(account({ workflowAccess: "TEST" }), "live")).toEqual({
      ok: false,
      reason: "test_account",
    });
  });

  it.each(["staging", "live"] as const)("refuses an unclassified account in %s", (mode) => {
    for (const workflowAccess of ["UNREVIEWED", "", null, undefined, "eligible", "ADMIN"]) {
      expect(workflowEligibility(account({ workflowAccess }), mode)).toEqual({
        ok: false,
        reason: "unreviewed",
      });
    }
  });

  it.each(["staging", "live"] as const)("refuses an excluded account in %s", (mode) => {
    expect(workflowEligibility(account({ workflowAccess: "EXCLUDED" }), mode)).toEqual({
      ok: false,
      reason: "excluded",
    });
  });

  it.each(["staging", "live"] as const)("needs a verified email and an adult in %s", (mode) => {
    const access = mode === "live" ? "ELIGIBLE" : "TEST";
    expect(
      workflowEligibility(account({ workflowAccess: access, emailVerified: null }), mode)
    ).toEqual({ ok: false, reason: "email_unverified" });
    expect(workflowEligibility(account({ workflowAccess: access, isAdult: false }), mode)).toEqual({
      ok: false,
      reason: "not_adult",
    });
  });
});

describe("loadProfileFacts", () => {
  const row = (id: string, user: Record<string, unknown> | null) => ({
    id,
    birthDate: new Date("1990-05-01T00:00:00Z"),
    isMinor: false,
    city: "Los Angeles",
    physical: "{}",
    preferences: "{}",
    mobilityCountries: '["US"]',
    minRateCents: null,
    user,
    specialties: [],
    availability: [],
  });
  const rows = [
    row("test", { id: "u1", emailVerified: verified, workflowAccess: "TEST" }),
    row("real", { id: "u2", emailVerified: verified, workflowAccess: "ELIGIBLE" }),
    row("unreviewed", { id: "u3", emailVerified: verified, workflowAccess: "UNREVIEWED" }),
    row("unverified-test", { id: "u4", emailVerified: null, workflowAccess: "TEST" }),
    row("unverified-real", { id: "u5", emailVerified: null, workflowAccess: "ELIGIBLE" }),
    row("excluded", { id: "u6", emailVerified: verified, workflowAccess: "EXCLUDED" }),
  ];
  const ids = rows.map((r) => r.id);
  const db = { artistProfile: { findMany: vi.fn(async () => rows) } } as never;
  const now = new Date("2026-11-19T12:00:00Z");

  it("runs only the test account in staging, which is the default", async () => {
    const loaded = await loadProfileFacts(db, ids, now);
    expect(loaded.profiles.map((p) => p.profileId)).toEqual(["test"]);
    expect(loaded.skipped).toBe(5);
  });

  it("runs only the reviewed, verified performer in live", async () => {
    const loaded = await loadProfileFacts(db, ids, now, "live");
    expect(loaded.profiles.map((p) => p.profileId)).toEqual(["real"]);
    expect(loaded.skipped).toBe(5);
  });

  it("reports how many were left out, never who", async () => {
    const loaded = await loadProfileFacts(db, ids, now);
    expect(Object.keys(loaded).sort()).toEqual(["profiles", "skipped"]);
  });
});
