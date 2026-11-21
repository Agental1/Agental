import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { B2C_PLANS, commissionCents } from "@/domain/pricing";
import { fillFaqGroups, fillPlanTokens, planFeatureLines } from "@/lib/plan-price";

const LOCALES = ["en", "fr", "es", "zh"] as const;
const talents = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "messages", locale, "talents.json"), "utf8"));

describe("Talent pricing grid (pitch deck, docs/DECISIONS.md)", () => {
  it("matches the founders' table", () => {
    const grid = Object.values(B2C_PLANS).map((p) => [p.plan, p.priceCents, p.commissionRate, p.aiSearches?.count]);
    expect(grid).toEqual([
      ["FREE", 0, 0.1, 5],
      ["PRO", 1900, 0.1, 50],
      ["PREMIUM", 4900, 0.075, 250],
      ["ULTIMATE", 7900, 0.05, 500],
    ]);
  });

  it("takes 5% on an Ultimate booking", () => {
    expect(commissionCents("ULTIMATE", 100_000)).toBe(5_000);
  });
});

describe("plan figures in the copy", () => {
  it("fills the plan's own figures", () => {
    expect(fillPlanTokens("{price}, {commission}, {searches}", "en", "PREMIUM")).toBe("$49, 7.5%, 250");
    expect(fillPlanTokens("{commission_ULTIMATE}", "en")).toBe("5%");
  });

  it("drops a search line when a plan has no allowance set", () => {
    const def = B2C_PLANS.PRO;
    const saved = def.aiSearches;
    def.aiSearches = null;
    try {
      expect(planFeatureLines(["Everything in Basic", "{searches} AI role searches per month"], "en", "PRO")).toEqual([
        "Everything in Basic",
      ]);
    } finally {
      def.aiSearches = saved;
    }
  });

  it("leaves a token it cannot resolve as it is", () => {
    expect(fillPlanTokens("{commission}", "en")).toBe("{commission}");
  });

  it("uses the locale's number style", () => {
    expect(fillPlanTokens("{commission}", "fr", "PREMIUM")).toMatch(/^7,5\s%$/u);
  });

  it("fills FAQ answers without touching the questions", () => {
    const [g] = fillFaqGroups([{ title: "t", items: [{ q: "{price}", a: "{commission_PRO}" }] }], "en");
    expect(g.items[0]).toEqual({ q: "{price}", a: "10%" });
  });

  for (const locale of LOCALES) {
    it(`${locale}: every token in plan and FAQ copy resolves`, () => {
      const m = talents(locale);
      const ids = ["FREE", "PRO", "PREMIUM", "ULTIMATE"] as const;
      const lines = [
        ...m.pricing.plans.flatMap((p: { features: string[] }, i: number) => planFeatureLines(p.features, locale, ids[i])),
        ...ids.flatMap((id) => planFeatureLines(m.space.planFeatures[id], locale, id)),
        ...fillFaqGroups(m.faq.groups as { items: { q: string; a: string }[] }[], locale).flatMap((g) =>
          g.items.map((i) => i.a)
        ),
      ];
      for (const line of lines) expect(line).not.toMatch(/\{(price|commission|searches)/);
      expect(m.pricing.plans.every((p: object) => !("price" in p) && !("commission" in p))).toBe(true);
      const ultimate = planFeatureLines(m.space.planFeatures.ULTIMATE, locale, "ULTIMATE").join(" ");
      expect(ultimate).toContain("500");
      expect(ultimate).toMatch(/5\s?%/u);
    });
  }
});

// A figure typed back into plan or FAQ copy is the stale-price mistake this
// refactor prevents: the copy must carry tokens, never amounts or rates.
const FIGURE = /(\$\s?\d|\d\s?\$|\d\s?美元|\d([.,]\d)?[\s  ]?%)/u;

describe("talent plan copy carries no literal figures", () => {
  for (const locale of LOCALES) {
    it(`${locale}: feature lines and FAQ answers use tokens only`, () => {
      const m = talents(locale);
      const lines: string[] = [
        ...m.pricing.plans.flatMap((p: { features: string[] }) => p.features),
        ...Object.values(m.space.planFeatures as Record<string, string[]>).flat(),
        ...m.faq.groups.flatMap((g: { items: { a: string }[] }) => g.items.map((i) => i.a)),
      ];
      for (const line of lines) expect(line).not.toMatch(FIGURE);
    });
  }
});
