import { describe, expect, it } from "vitest";
import { MockScorer } from "@/lib/ai/scorer";
import { MatchReasons } from "@/domain/match-reason";
import type { RoleSpec } from "@/domain/json";

/**
 * The shortlist explanation used to be a French sentence built on the server
 * and persisted. Three different people read it — the casting director who ran
 * the brief, a colleague, and the talent through their own candidatures list —
 * and it was French for all of them, in all three locales.
 *
 * These pin which reason each rule emits. The compiler already guarantees the
 * keys exist; it cannot guarantee the right rule fires.
 */

const scorer = new MockScorer();
const role: RoleSpec = {
  role: "Maxime",
  ageMin: 25,
  ageMax: 32,
  accent: "breton",
  language: "français",
  constraints: [],
};

const talent = (over: Partial<Parameters<typeof scorer.score>[1][0]> = {}) => ({
  talentId: "t1",
  source: "AGENTAL" as const,
  name: "Yann",
  age: 28,
  accents: ["breton"],
  languages: ["français"],
  specialties: [],
  ...over,
});

const reasonsOf = async (t: ReturnType<typeof talent>) =>
  (await scorer.score(role, [t]))[0].reasons;
const keysOf = async (t: ReturnType<typeof talent>) =>
  (await reasonsOf(t)).map((r) => r.key);

describe("MockScorer reasons", () => {
  it("carries the accent as data, not baked into the label", async () => {
    // "Accent {accent} natif" — the accent name is a value, so the sentence
    // can be written differently in each language.
    const [first] = await reasonsOf(talent());
    expect(first).toEqual({ key: "accentNative", values: { accent: "breton" } });
  });

  it("stays silent about the accent when it does not match", async () => {
    expect(await keysOf(talent({ accents: ["corse"] }))).not.toContain(
      "accentNative"
    );
  });

  it("reports age only when it is actually in range", async () => {
    expect(await keysOf(talent({ age: 28 }))).toContain("ageInRange");
    expect(await keysOf(talent({ age: 55, accents: [] }))).not.toContain(
      "ageInRange"
    );
  });

  it("reports the language only on a match", async () => {
    expect(await keysOf(talent({ accents: [], age: 55 }))).toContain(
      "languageMatch"
    );
    expect(
      await keysOf(talent({ accents: [], age: 55, languages: ["breton"] }))
    ).not.toContain("languageMatch");
  });

  it("never trims the off-roster disclosure, even when reasons overflow", async () => {
    // Provenance is not a reason — it is what tells a director this person is
    // not on the roster. Capping the list must not be able to drop it.
    const reasons = await keysOf(talent({ source: "EXTERNAL" }));
    expect(reasons).toContain("sourcedOffRoster");
    expect(reasons[reasons.length - 1]).toBe("sourcedOffRoster");
  });

  it("keeps a roster talent's card free of that disclosure", async () => {
    expect(await keysOf(talent())).not.toContain("sourcedOffRoster");
  });

  it("keeps the card scannable — at most three reasons plus provenance", async () => {
    expect((await keysOf(talent())).length).toBeLessThanOrEqual(3);
    expect(
      (await keysOf(talent({ source: "EXTERNAL" }))).length
    ).toBeLessThanOrEqual(4);
  });

  it("emits nothing a reader could not render", async () => {
    // Round-trips through the schema the database column is parsed with.
    const result = await scorer.score(role, [
      talent(),
      talent({ source: "EXTERNAL" }),
    ]);
    for (const r of result) {
      expect(() => MatchReasons.parse(JSON.parse(JSON.stringify(r.reasons)))).not.toThrow();
    }
  });

  it("returns keys, never a rendered sentence", async () => {
    // The regression guard: putting readable text back would pass everything
    // above except this.
    for (const r of await reasonsOf(talent())) {
      expect(r.key).toMatch(/^[a-zA-Z]+$/);
    }
  });
});
