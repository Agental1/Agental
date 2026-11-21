import { type Tally, runCalibration, tally } from "./run";
import { MAYA_PREFERENCES } from "./performer";

/**
 * Prints the calibration: bun tools/calibration/report.ts
 * Nothing is stored, sent or fetched. No model is called.
 */

const pct = (n: number, d: number) => `${n} of ${d}`;

function printTally(name: string, t: Tally, withReasons: boolean) {
  console.log(`\n${name}`);
  console.log(`  agrees with the label:        ${pct(t.agree, t.total)}`);
  console.log(`  appropriate suggestions:      ${pct(t.suggestedRight, t.suggested)} suggested`);
  console.log(`  suitable briefs missed:       ${pct(t.suitableMissed, t.suitable)}`);
  console.log(`  hard constraints blocked:     ${pct(t.hardBlocked, t.hard)}`);
  console.log(`  hard constraints violated:    ${pct(t.hardViolated, t.hard)}`);
  console.log(`  open questions surfaced:      ${pct(t.needsInfoAsked, t.needsInfo)}`);
  if (withReasons) {
    console.log(`  expected reason given:        ${pct(t.reasonsRight, t.reasonsExpected)}`);
  }
}

const started = performance.now();
const run = await runCalibration();
const elapsed = performance.now() - started;

console.log(`rules ${run.ruleVersion}, ${run.rows.length} briefs, ${elapsed.toFixed(0)} ms\n`);
console.log("id   split    label           baseline        workflow        rules");
for (const row of run.rows) {
  console.log(
    [
      row.item.id.padEnd(4),
      row.item.split.padEnd(8),
      row.item.label.padEnd(15),
      row.baseline.padEnd(15),
      row.workflow.padEnd(15),
      row.rules.join(", "),
    ].join(" ")
  );
}
for (const split of ["tune", "holdout", "all"] as const) {
  const rows = run.rows.filter((r) => split === "all" || r.item.split === split);
  printTally(`BASELINE, ${split}`, tally(rows.map((r) => ({ item: r.item, got: r.baseline, rules: null }))), false);
  printTally(`WORKFLOW, ${split}`, tally(rows.map((r) => ({ item: r.item, got: r.workflow, rules: r.rules }))), true);
}

const again = await runCalibration();
const same = run.rows.every(
  (row, i) =>
    row.workflow === again.rows[i].workflow &&
    row.dedupeKey === again.rows[i].dedupeKey &&
    row.inputHash === again.rows[i].inputHash
);
console.log(`\nsecond run identical (decisions, dedupe keys, input hashes): ${same}`);

const open = await runCalibration({ ...MAYA_PREFERENCES, compensation: "paid_or_unpaid" });
const changed = run.rows
  .map((row, i) => ({ id: row.item.id, before: row.workflow, after: open.rows[i].workflow }))
  .filter((r) => r.before !== r.after);
console.log(`preference change (paid only -> open to unpaid) changes: ${JSON.stringify(changed)}`);
console.log(`every objection names its fields: ${run.rows.every((r) => r.evidenceComplete)}`);
