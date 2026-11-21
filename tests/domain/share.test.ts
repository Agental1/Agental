import { describe, expect, it } from "vitest";
import {
  clampShareHours,
  CreateShareLinkInput,
  SHARE_DEFAULT_HOURS,
  SHARE_MAX_ACTIVE,
  SHARE_MAX_HOURS,
  SHARE_MIN_HOURS,
  shareExpiry,
  shareIsActive,
} from "@/domain/share";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-19T10:00:00Z");

describe("share link limits", () => {
  it("are 72 hours by default, 1 hour at least, 7 days at most, 5 links per clip", () => {
    expect(SHARE_DEFAULT_HOURS).toBe(72);
    expect(SHARE_MIN_HOURS).toBe(1);
    expect(SHARE_MAX_HOURS).toBe(168);
    expect(SHARE_MAX_ACTIVE).toBe(5);
  });
});

describe("clampShareHours", () => {
  it("uses the default when nothing usable is asked for", () => {
    expect(clampShareHours()).toBe(72);
    expect(clampShareHours(undefined)).toBe(72);
    expect(clampShareHours(null)).toBe(72);
    expect(clampShareHours(Number.NaN)).toBe(72);
    expect(clampShareHours(Number.POSITIVE_INFINITY)).toBe(72);
  });

  it("keeps a value inside the range", () => {
    expect(clampShareHours(1)).toBe(1);
    expect(clampShareHours(24)).toBe(24);
    expect(clampShareHours(168)).toBe(168);
  });

  it("raises a short request to one hour and caps a long one at seven days", () => {
    expect(clampShareHours(0)).toBe(1);
    expect(clampShareHours(-5)).toBe(1);
    expect(clampShareHours(0.25)).toBe(1);
    expect(clampShareHours(169)).toBe(168);
    expect(clampShareHours(100000)).toBe(168);
  });
});

describe("shareExpiry", () => {
  it("adds the clamped lifetime to the moment of creation", () => {
    expect(shareExpiry(NOW).getTime()).toBe(NOW.getTime() + 72 * HOUR);
    expect(shareExpiry(NOW, 24).getTime()).toBe(NOW.getTime() + 24 * HOUR);
    expect(shareExpiry(NOW, 9999).getTime()).toBe(NOW.getTime() + 168 * HOUR);
    expect(shareExpiry(NOW, 0).getTime()).toBe(NOW.getTime() + 1 * HOUR);
  });
});

describe("shareIsActive", () => {
  const later = new Date(NOW.getTime() + HOUR);
  const earlier = new Date(NOW.getTime() - HOUR);

  it("is true until the link expires", () => {
    expect(shareIsActive({ expiresAt: later, revokedAt: null }, NOW)).toBe(true);
    expect(shareIsActive({ expiresAt: earlier, revokedAt: null }, NOW)).toBe(false);
    // The expiry instant itself is already too late.
    expect(shareIsActive({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false);
  });

  it("is false once revoked, whatever the expiry", () => {
    expect(shareIsActive({ expiresAt: later, revokedAt: earlier }, NOW)).toBe(false);
  });
});

describe("CreateShareLinkInput", () => {
  it("accepts no lifetime, null, or a number", () => {
    expect(CreateShareLinkInput.safeParse({}).success).toBe(true);
    expect(CreateShareLinkInput.safeParse({ expiresInHours: null }).success).toBe(true);
    expect(CreateShareLinkInput.safeParse({ expiresInHours: 24 }).success).toBe(true);
    // Out of range is clamped later, never refused here.
    expect(CreateShareLinkInput.safeParse({ expiresInHours: 5000 }).success).toBe(true);
  });

  it("refuses a lifetime that is not a number", () => {
    expect(CreateShareLinkInput.safeParse({ expiresInHours: "24" }).success).toBe(false);
    expect(CreateShareLinkInput.safeParse({ expiresInHours: Number.NaN }).success).toBe(false);
    expect(CreateShareLinkInput.safeParse(null).success).toBe(false);
  });
});
