import { afterEach, describe, expect, it } from "vitest";
import { getScorer, MockScorer } from "@/lib/ai/scorer";

/**
 * The rule these pin is a silent one. `SCORER=llm` with no key used to return
 * the mock, so a deployment that believed AI matching was on served
 * deterministic scores — each carrying a written French justification — to a
 * casting director, with nothing distinguishing them from real matching.
 * Nothing logged, nothing failed, and the shortlist looked normal.
 */

const saved = { SCORER: process.env.SCORER, KEY: process.env.ANTHROPIC_API_KEY };

afterEach(() => {
  if (saved.SCORER === undefined) delete process.env.SCORER;
  else process.env.SCORER = saved.SCORER;
  if (saved.KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = saved.KEY;
});

describe("getScorer", () => {
  it("defaults to the deterministic mock", async () => {
    delete process.env.SCORER;
    expect(await getScorer()).toBeInstanceOf(MockScorer);
  });

  it("uses the mock for any value other than llm", async () => {
    process.env.SCORER = "mock";
    expect(await getScorer()).toBeInstanceOf(MockScorer);
  });

  it("refuses SCORER=llm without a key instead of downgrading", async () => {
    process.env.SCORER = "llm";
    delete process.env.ANTHROPIC_API_KEY;
    await expect(getScorer()).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });

  it("names the fix in the error, so it is actionable from the log alone", async () => {
    process.env.SCORER = "llm";
    delete process.env.ANTHROPIC_API_KEY;
    await expect(getScorer()).rejects.toThrow(/unset SCORER/);
  });

  it("returns something other than the mock once a key is present", async () => {
    process.env.SCORER = "llm";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
    expect(await getScorer()).not.toBeInstanceOf(MockScorer);
  });
});
