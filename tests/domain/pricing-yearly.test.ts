import { describe, expect, it } from "vitest";
import { B2C_PLANS } from "@/domain/pricing";

describe("yearly display prices (round 12)", () => {
  it("costs 10 months for 12 on every paid plan", () => {
    for (const def of Object.values(B2C_PLANS)) {
      expect(def.yearlyPriceCents).toBe(def.priceCents * 10);
    }
  });
  it("matches the founder's figures and keeps Basic at zero", () => {
    expect(B2C_PLANS.FREE.yearlyPriceCents).toBe(0);
    expect(B2C_PLANS.PRO.yearlyPriceCents).toBe(19000);
    expect(B2C_PLANS.PREMIUM.yearlyPriceCents).toBe(49000);
    expect(B2C_PLANS.ULTIMATE.yearlyPriceCents).toBe(79000);
  });
});
