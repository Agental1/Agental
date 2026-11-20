import { describe, expect, it } from "vitest";
import { allowanceFor, periodKeyFor, quotaFrom, RoleSearchClientKey } from "@/domain/role-search";

const nov = new Date("2026-11-19T12:00:00Z");

describe("role search allowance", () => {
  it("gives each plan its monthly allowance", () => {
    expect(allowanceFor("FREE")).toEqual({ kind: "monthly", count: 5 });
    expect(allowanceFor("PRO")).toEqual({ kind: "monthly", count: 50 });
    expect(allowanceFor("PREMIUM")).toEqual({ kind: "monthly", count: 250 });
    expect(allowanceFor("ULTIMATE")).toEqual({ kind: "monthly", count: 500 });
  });

  it("keeps a positive allowance for every plan", () => {
    expect(allowanceFor("PREMIUM").count).toBeGreaterThan(0);
    expect(allowanceFor("ULTIMATE").count).toBeGreaterThan(0);
  });

  it("keys a monthly allowance by UTC calendar month", () => {
    expect(periodKeyFor({ kind: "monthly", count: 50 }, nov)).toBe("2026-11");
    expect(periodKeyFor({ kind: "monthly", count: 50 }, new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    expect(periodKeyFor({ kind: "lifetime", count: 5 }, nov)).toBe("lifetime");
  });

  it("never reports a negative remainder", () => {
    expect(quotaFrom("FREE", 8, nov).remaining).toBe(0);
    expect(quotaFrom("FREE", 1, nov)).toMatchObject({ limit: 5, used: 1, remaining: 4 });
  });

  it("accepts only URL-safe client keys", () => {
    expect(RoleSearchClientKey.safeParse("a1b2c3d4e5f6").success).toBe(true);
    expect(RoleSearchClientKey.safeParse("short").success).toBe(false);
    expect(RoleSearchClientKey.safeParse("x'; drop table--").success).toBe(false);
  });
});
