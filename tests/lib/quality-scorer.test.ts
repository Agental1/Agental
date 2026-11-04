import { describe, expect, it } from "vitest";
import { MockQualityScorer, type TipKey } from "@/lib/ai/quality-scorer";
import frTalents from "../../messages/en/talents.json";

/**
 * The advice a talent reads after every recording. It used to be five French
 * sentences built on the server, shown untranslated to everyone — the scorer
 * now returns keys and the client renders them in the visitor's language.
 *
 * `t(tip)` in self-tape-studio.tsx only compiles because TipKey is a real
 * message path, so the compiler already proves the keys exist. What it cannot
 * prove is which branch emits which key, which is what these cover.
 */

const scorer = new MockQualityScorer();
const good = { framing: 0.9, light: 0.9, sound: 0.9, durationMs: 30_000 };

describe("MockQualityScorer tips", () => {
  it("says nothing is wrong when nothing is", () => {
    expect(scorer.score(good).tips).toEqual(["space.selftape.tips.excellent"]);
  });

  it("names framing, light and sound independently", () => {
    expect(scorer.score({ ...good, framing: 0.2 }).tips).toContain(
      "space.selftape.tips.framing"
    );
    expect(scorer.score({ ...good, light: 0.2 }).tips).toContain(
      "space.selftape.tips.light"
    );
    expect(scorer.score({ ...good, sound: 0.2 }).tips).toContain(
      "space.selftape.tips.sound"
    );
  });

  it("flags a take too short to act", () => {
    expect(scorer.score({ ...good, durationMs: 1500 }).tips).toContain(
      "space.selftape.tips.tooShort"
    );
  });

  it("never mixes the all-clear with a complaint", () => {
    // "Excellent take" next to "move closer to the mic" would read as a bug.
    const tips = scorer.score({ ...good, sound: 0.1 }).tips;
    expect(tips).not.toContain("space.selftape.tips.excellent");
  });

  it("reports every problem at once rather than the first", () => {
    const tips = scorer.score({
      framing: 0.1,
      light: 0.1,
      sound: 0.1,
      durationMs: 1000,
    }).tips;
    expect(tips).toHaveLength(4);
  });

  it("emits only keys that exist in the message file", () => {
    const known = new Set(
      Object.keys(frTalents.space.selftape.tips).map(
        (k) => `space.selftape.tips.${k}` as TipKey
      )
    );
    const all: TipKey[] = [
      ...scorer.score(good).tips,
      ...scorer.score({ framing: 0, light: 0, sound: 0, durationMs: 0 }).tips,
    ];
    for (const tip of all) expect(known.has(tip)).toBe(true);
  });

  it("returns no sentence — a tip is a key, never rendered text", () => {
    // The regression guard: someone "helpfully" putting a readable string back
    // would pass every assertion above except this one.
    for (const tip of scorer.score({ ...good, light: 0 }).tips) {
      expect(tip).toMatch(/^space\.selftape\.tips\.[a-zA-Z]+$/);
      expect(tip).not.toMatch(/\s/);
    }
  });
});
