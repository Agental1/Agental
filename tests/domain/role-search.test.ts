import { describe, expect, it } from "vitest";
import {
  allowanceFor,
  periodActive,
  periodEnd,
  periodKeyFor,
  quotaFrom,
  RoleSearchClientKey,
} from "@/domain/role-search";

const day = 24 * 60 * 60 * 1000;
const start = new Date("2026-11-01T10:00:00Z");

describe("role search allowance", () => {
  it("gives each plan its monthly allowance", () => {
    expect(allowanceFor("FREE").count).toBe(5);
    expect(allowanceFor("PRO").count).toBe(50);
    expect(allowanceFor("PREMIUM").count).toBe(250);
    expect(allowanceFor("ULTIMATE").count).toBe(500);
  });

  it("runs a period for 30 days from the first search", () => {
    expect(periodEnd(start).getTime()).toBe(start.getTime() + 30 * day);
    expect(periodActive(start, new Date(start.getTime() + 29 * day))).toBe(true);
    expect(periodActive(start, new Date(start.getTime() + 30 * day))).toBe(false);
    expect(periodActive(null, start)).toBe(false);
    expect(periodKeyFor(start)).not.toBe(periodKeyFor(new Date(start.getTime() + 1)));
  });

  it("says the full allowance is available before the first search", () => {
    expect(quotaFrom("FREE", 0, null, start)).toMatchObject({ limit: 5, remaining: 5, resetsAt: null, resetInDays: null });
  });

  it("counts down and shows the days to the reset", () => {
    const now = new Date(start.getTime() + 18 * day + 1000);
    expect(quotaFrom("FREE", 2, start, now)).toMatchObject({ limit: 5, used: 2, remaining: 3, resetInDays: 12 });
  });

  it("resets to the full allowance once the period has ended", () => {
    const now = new Date(start.getTime() + 31 * day);
    expect(quotaFrom("FREE", 5, start, now)).toMatchObject({ used: 0, remaining: 5, resetsAt: null });
  });

  it("applies a new plan's limit at once and keeps the reset date", () => {
    const now = new Date(start.getTime() + 10 * day);
    const basic = quotaFrom("FREE", 5, start, now);
    const pro = quotaFrom("PRO", 5, start, now);
    expect(basic.remaining).toBe(0);
    expect(pro.remaining).toBe(45);
    expect(pro.resetsAt).toBe(basic.resetsAt);
  });

  it("never reports a negative remainder", () => {
    expect(quotaFrom("FREE", 8, start, new Date(start.getTime() + day)).remaining).toBe(0);
  });

  it("accepts only URL-safe client keys", () => {
    expect(RoleSearchClientKey.safeParse("a1b2c3d4e5f6").success).toBe(true);
    expect(RoleSearchClientKey.safeParse("short").success).toBe(false);
  });
});
