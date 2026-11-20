import { describe, expect, it } from "vitest";
import { allowanceFor, periodKeyFor, quotaFrom, RoleSearchClientKey } from "@/domain/role-search";

const nov = new Date("2026-11-19T12:00:00Z");

describe("role search allowance", () => {
  it("gives Basic 4 searches once and Pro 50 a month", () => {
    expect(allowanceFor("FREE")).toEqual({ kind: "lifetime", count: 4 });
    expect(allowanceFor("PRO")).toEqual({ kind: "monthly", count: 50 });
  });

  it("falls back to 50 a month while Premium and Ultimate are not set", () => {
    expect(allowanceFor("PREMIUM").count).toBeGreaterThan(0);
    expect(allowanceFor("ULTIMATE").count).toBeGreaterThan(0);
  });

  it("keys a monthly allowance by UTC calendar month", () => {
    expect(periodKeyFor({ kind: "monthly", count: 50 }, nov)).toBe("2026-11");
    expect(periodKeyFor({ kind: "monthly", count: 50 }, new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    expect(periodKeyFor({ kind: "lifetime", count: 4 }, nov)).toBe("lifetime");
  });

  it("never reports a negative remainder", () => {
    expect(quotaFrom("FREE", 6, nov).remaining).toBe(0);
    expect(quotaFrom("FREE", 1, nov)).toMatchObject({ limit: 4, used: 1, remaining: 3 });
  });

  it("accepts only URL-safe client keys", () => {
    expect(RoleSearchClientKey.safeParse("a1b2c3d4e5f6").success).toBe(true);
    expect(RoleSearchClientKey.safeParse("short").success).toBe(false);
    expect(RoleSearchClientKey.safeParse("x'; drop table--").success).toBe(false);
  });
});
