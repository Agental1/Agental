import { describe, expect, it } from "vitest";
import { B2C_PLANS, commissionCents } from "@/domain/pricing";

// The published Talents grid: the subscription tier sets the commission rate.
describe("B2C commission by plan", () => {
  it.each([
    ["FREE", 0.1],
    ["PRO", 0.1],
    ["PREMIUM", 0.075],
    ["ULTIMATE", 0.05],
  ] as const)("%s takes %s", (plan, rate) => {
    expect(B2C_PLANS[plan].commissionRate).toBe(rate);
  });

  it("applies the plan's rate to a fee", () => {
    expect(commissionCents("FREE", 100_000)).toBe(10_000);
    expect(commissionCents("PREMIUM", 100_000)).toBe(7_500);
    expect(commissionCents("ULTIMATE", 100_000)).toBe(5_000);
  });
});
