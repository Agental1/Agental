import { describe, expect, it } from "vitest";
import { hoursUntil, nextSearchStart, SEARCH_SPACING_MS } from "@/domain/role-search";

const now = new Date("2026-11-22T12:00:00Z");

describe("search schedule (round 8b)", () => {
  it("starts at once with no earlier search, or one long ago", () => {
    expect(nextSearchStart(null, now)).toEqual(now);
    expect(nextSearchStart(new Date("2026-11-20T00:00:00Z"), now)).toEqual(now);
  });
  it("waits 6 hours after the latest search", () => {
    const latest = new Date("2026-11-22T10:00:00Z");
    expect(nextSearchStart(latest, now).getTime()).toBe(latest.getTime() + SEARCH_SPACING_MS);
  });
  it("says about 6, 12 and 18 hours, rounded up", () => {
    const at = (h: number) => new Date(now.getTime() + h * 3600_000);
    expect([hoursUntil(at(6), now), hoursUntil(at(11.2), now), hoursUntil(at(18), now)]).toEqual([6, 12, 18]);
    expect(hoursUntil(at(-1), now)).toBe(0);
  });
});
