import { describe, expect, it } from "vitest";
import {
  parseRequiredSince,
  requiresEmailVerification,
} from "@/domain/email-verification";

const since = new Date("2026-12-01T00:00:00Z");
const on = { senderConfigured: true, requiredSince: since };

const account = (over: Partial<Parameters<typeof requiresEmailVerification>[0]> = {}) => ({
  emailVerified: null,
  passwordHash: "$2b$10$hash",
  createdAt: new Date("2026-12-05T09:00:00Z"),
  ...over,
});

describe("requiresEmailVerification", () => {
  it("asks an unconfirmed password account created after the start date", () => {
    expect(requiresEmailVerification(account(), on)).toBe(true);
  });

  it("includes an account created at the start date, to the millisecond", () => {
    expect(requiresEmailVerification(account({ createdAt: since }), on)).toBe(true);
    expect(
      requiresEmailVerification(account({ createdAt: new Date(since.getTime() - 1) }), on)
    ).toBe(false);
  });

  it("leaves accounts created before the start date alone", () => {
    expect(
      requiresEmailVerification(account({ createdAt: new Date("2026-06-01T00:00:00Z") }), on)
    ).toBe(false);
  });

  it("is off while no start date is set", () => {
    expect(
      requiresEmailVerification(account(), { senderConfigured: true, requiredSince: null })
    ).toBe(false);
  });

  it("is off while no email sender is configured, whatever the date", () => {
    expect(
      requiresEmailVerification(account(), { senderConfigured: false, requiredSince: since })
    ).toBe(false);
  });

  it("is satisfied once the address is confirmed", () => {
    expect(
      requiresEmailVerification(account({ emailVerified: new Date("2026-12-05T09:05:00Z") }), on)
    ).toBe(false);
  });

  it("never asks an account with no password: its provider confirmed the address", () => {
    expect(requiresEmailVerification(account({ passwordHash: null }), on)).toBe(false);
    expect(requiresEmailVerification(account({ passwordHash: "" }), on)).toBe(false);
  });
});

describe("parseRequiredSince", () => {
  it("reads a calendar day as the first instant of that day, UTC", () => {
    expect(parseRequiredSince("2026-12-01")).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });

  it.each([
    ["2026-12-01T00:00:00Z", "2026-12-01T00:00:00.000Z"],
    ["2026-12-01T08:30:00.250Z", "2026-12-01T08:30:00.250Z"],
    ["2026-12-01T09:00:00+01:00", "2026-12-01T08:00:00.000Z"],
    ["2026-11-30T19:00:00-05:00", "2026-12-01T00:00:00.000Z"],
  ])("reads the instant %s", (raw, expected) => {
    expect(parseRequiredSince(raw)?.toISOString()).toBe(expected);
  });

  it("ignores surrounding spaces", () => {
    expect(parseRequiredSince("  2026-12-01\n")).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });

  it.each([
    [undefined],
    [""],
    ["   "],
    ["true"],
    ["tomorrow"],
    ["01/12/2026"],
    ["2026-12"],
    ["2026-13-01"],
    ["2026-02-30"],
    ["1764547200000"],
    // An instant with no zone would mean a different moment on every server.
    ["2026-12-01T00:00:00"],
    ["2026-12-01 00:00:00Z"],
  ])("reads %j as no date", (raw) => {
    expect(parseRequiredSince(raw)).toBeNull();
  });

  it("is null for a value that is not a string", () => {
    expect(parseRequiredSince(20261201 as unknown as string)).toBeNull();
    expect(parseRequiredSince(null as unknown as string)).toBeNull();
  });

  it("feeds the gate: an unreadable date keeps it off", () => {
    const user = account();
    expect(
      requiresEmailVerification(user, {
        senderConfigured: true,
        requiredSince: parseRequiredSince("2026-12-01"),
      })
    ).toBe(true);
    expect(
      requiresEmailVerification(user, {
        senderConfigured: true,
        requiredSince: parseRequiredSince("soon"),
      })
    ).toBe(false);
  });
});
