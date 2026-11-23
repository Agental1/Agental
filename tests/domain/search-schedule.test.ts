import { describe, expect, it } from "vitest";
import { B2C_PLANS } from "@/domain/pricing";
import { busySlots, hoursUntil, nextSearchStart, searchPaceFor } from "@/domain/role-search";

const now = new Date("2026-11-22T12:00:00Z");
const H = 3600_000;
const at = (h: number) => new Date(now.getTime() + h * H);

describe("search schedule (round 8b, slots in round 8d)", () => {
  const basic = searchPaceFor("FREE");
  const pro = searchPaceFor("PRO");

  it("slots and the gap come from the plan configuration", () => {
    expect([searchPaceFor("FREE").slots, pro.slots, searchPaceFor("PREMIUM").slots, searchPaceFor("ULTIMATE").slots]).toEqual([1, 2, 5, 10]);
    expect(basic.spacingMs).toBe(6 * H);
  });

  it("every plan can use its whole allowance in 30 days", () => {
    for (const def of Object.values(B2C_PLANS)) {
      const perMonth = def.searchSlots * (24 / def.searchSpacingHours) * 30;
      expect(perMonth).toBeGreaterThanOrEqual(def.aiSearches!.count);
    }
  });

  it("one slot: starts at once, or 6 hours after the latest search", () => {
    expect(nextSearchStart([], now, basic)).toEqual(now);
    expect(nextSearchStart([new Date("2026-11-20T00:00:00Z")], now, basic)).toEqual(now);
    expect(nextSearchStart([at(-2)], now, basic)).toEqual(at(4));
  });

  it("two slots: two start now, the third 6 hours after the second most recent", () => {
    expect(nextSearchStart([now], now, pro)).toEqual(now);
    expect(nextSearchStart([now, now], now, pro)).toEqual(at(6));
    expect(nextSearchStart([now, now, at(6)], now, pro)).toEqual(at(6));
    expect(nextSearchStart([now, now, at(6), at(6)], now, pro)).toEqual(at(12));
  });

  it("counts busy slots: running, or started less than a gap ago", () => {
    const rows = [
      { status: "running", startedAt: at(-7) },
      { status: "done", startedAt: at(-1) },
      { status: "done", startedAt: at(-7) },
    ];
    expect(busySlots(rows, now, pro)).toBe(2);
  });

  it("says about 6, 12 and 18 hours, rounded up", () => {
    expect([hoursUntil(at(6), now), hoursUntil(at(11.2), now), hoursUntil(at(18), now)]).toEqual([6, 12, 18]);
    expect(hoursUntil(at(-1), now)).toBe(0);
  });
});
