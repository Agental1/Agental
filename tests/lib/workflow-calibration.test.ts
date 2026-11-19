import { describe, expect, it } from "vitest";
import { BRIEFS } from "../../tools/calibration/briefs";
import { MAYA_PREFERENCES } from "../../tools/calibration/performer";
import { runCalibration, tally } from "../../tools/calibration/run";

/**
 * The one-person calibration, pinned (docs/CALIBRATION.md). A synthetic
 * performer, seventeen fictional briefs labeled by the pilot owner, the naive
 * baseline and the dry-run rules side by side.
 *
 * The first block holds the stop conditions: if one of them fails, the
 * workflow is not promoted. The second pins the counts the document quotes,
 * so a rule change that moves them shows up here and in the document together.
 */
const workflowRows = (run: Awaited<ReturnType<typeof runCalibration>>, split?: string) =>
  run.rows
    .filter((r) => !split || r.item.split === split)
    .map((r) => ({ item: r.item, got: r.workflow, rules: r.rules }));
const baselineRows = (run: Awaited<ReturnType<typeof runCalibration>>) =>
  run.rows.map((r) => ({ item: r.item, got: r.baseline, rules: null }));

describe("calibration set", () => {
  it("has at least twelve briefs, at least four unseen, and every kind of case", () => {
    expect(BRIEFS.length).toBeGreaterThanOrEqual(12);
    expect(BRIEFS.filter((b) => b.split === "holdout").length).toBeGreaterThanOrEqual(4);
    expect(new Set(BRIEFS.map((b) => b.kind))).toEqual(
      new Set(["relevant", "irrelevant", "expired", "incomplete", "ambiguous"])
    );
    expect(new Set(BRIEFS.map((b) => b.id)).size).toBe(BRIEFS.length);
  });
});

describe("stop conditions", () => {
  it("never suggests a brief that breaks a hard constraint", async () => {
    const run = await runCalibration();
    const t = tally(workflowRows(run));
    expect(t.hard).toBeGreaterThan(0);
    expect(t.hardViolated).toBe(0);
    expect(t.hardBlocked).toBe(t.hard);
  });

  it("gives every objection and every question the fields it read", async () => {
    const run = await runCalibration();
    expect(run.rows.every((r) => r.evidenceComplete)).toBe(true);
    // A brief that is declined or held always says why.
    for (const row of run.rows) {
      if (row.workflow !== "would_consider") expect(row.rules.length).toBeGreaterThan(0);
    }
  });

  it("gives the same answers, keys and hashes on a second run", async () => {
    const first = await runCalibration();
    const second = await runCalibration();
    expect(second.rows.map((r) => [r.workflow, r.dedupeKey, r.inputHash])).toEqual(
      first.rows.map((r) => [r.workflow, r.dedupeKey, r.inputHash])
    );
    expect(new Set(first.rows.map((r) => r.dedupeKey)).size).toBe(first.rows.length);
  });
});

describe("results quoted in docs/CALIBRATION.md", () => {
  it("rules path: 15 of 17 agree with the labels, 5 of 5 on the unseen briefs", async () => {
    const run = await runCalibration();
    const all = tally(workflowRows(run));
    expect([all.agree, all.total]).toEqual([15, 17]);
    expect([all.suggestedRight, all.suggested]).toEqual([4, 5]);
    expect([all.suitableMissed, all.suitable]).toEqual([0, 4]);
    expect([all.hardBlocked, all.hard]).toEqual([5, 5]);
    expect([all.needsInfoAsked, all.needsInfo]).toEqual([4, 6]);
    expect([all.reasonsRight, all.reasonsExpected]).toEqual([12, 13]);

    const unseen = tally(workflowRows(run, "holdout"));
    expect([unseen.agree, unseen.total]).toEqual([5, 5]);
  });

  it("baseline: 7 of 17, and it suggests 4 of the 5 briefs a hard constraint rules out", async () => {
    const run = await runCalibration();
    const all = tally(baselineRows(run));
    expect([all.agree, all.total]).toEqual([7, 17]);
    expect([all.suggestedRight, all.suggested]).toEqual([4, 12]);
    expect([all.hardViolated, all.hard]).toEqual([4, 5]);
    expect([all.needsInfoAsked, all.needsInfo]).toEqual([0, 6]);
  });

  it("the two known misses are the ones the document describes", async () => {
    const run = await runCalibration();
    const misses = run.rows.filter((r) => r.workflow !== r.item.label).map((r) => r.item.id);
    expect(misses).toEqual(["T10", "T12"]);
  });

  it("changing a preference changes the recommendation it governs, and no other", async () => {
    const before = await runCalibration();
    const after = await runCalibration({ ...MAYA_PREFERENCES, compensation: "paid_or_unpaid" });
    const changed = before.rows
      .map((row, i) => [row.item.id, row.workflow, after.rows[i].workflow])
      .filter(([, a, b]) => a !== b);
    // The unpaid student film stops being ruled out. It becomes a question,
    // because she also set a minimum rate.
    expect(changed).toEqual([["T03", "would_decline", "needs_info"]]);

    const noBoundary = await runCalibration({
      ...MAYA_PREFERENCES,
      contentBoundaries: { nudity: true },
    });
    const moved = before.rows
      .map((row, i) => [row.item.id, row.workflow, noBoundary.rows[i].workflow])
      .filter(([, a, b]) => a !== b);
    expect(moved).toEqual([["T08", "would_decline", "would_consider"]]);
  });
});
