import { evaluateBriefsForProfile, type CalibrationItem } from "@/lib/workflow/evaluate";
import type { ProfileFacts } from "@/domain/workflow/profile";
import { BRIEFS, type Label, type LabeledBrief } from "./briefs";
import { CALIBRATION_NOW, MAYA_PREFERENCES, mayaFacts } from "./performer";

/**
 * One-person calibration: the same labeled briefs through a naive baseline
 * and through the rules of the dry-run path, for one synthetic performer.
 *
 * Print it with: bun tools/calibration/report.ts
 * Nothing is stored, sent or fetched. No model is called.
 */

export type Outcome = Label;

/**
 * The baseline: what a simple matcher does. Suggest every open brief whose
 * role type is one of the performer's specialties, decline the rest. It never
 * asks a question and reads no preference.
 */
export function baseline(item: LabeledBrief, profile: ProfileFacts, now: Date): Outcome {
  const brief = item.brief as { roleType?: string; expiresAt?: string };
  if (brief.expiresAt && new Date(`${brief.expiresAt}T23:59:59Z`) < now) return "would_decline";
  const kinds = new Set(profile.specialties.map((s) => s.kind));
  return brief.roleType && kinds.has(brief.roleType) ? "would_consider" : "would_decline";
}

/** The dry-run path's answer, in the labels' vocabulary. */
export function outcomeOf(item: CalibrationItem): Outcome {
  if (item.status === "expired") return "would_decline";
  if (item.decision === "eligible") return "would_consider";
  if (item.decision === "needs_review") return "needs_info";
  return "would_decline";
}

/** The rules that objected (failed) or asked (unknown) for one item. */
export function objecting(item: CalibrationItem): string[] {
  if (item.status === "expired") return ["brief_open"];
  const evaluation = item.evaluation;
  if (!evaluation) return [];
  return [
    ...evaluation.ruleFailures.map((r) => r.rule),
    ...evaluation.unknowns.map((r) => r.rule),
  ];
}

export interface Tally {
  total: number;
  agree: number;
  suggested: number;
  suggestedRight: number;
  suitable: number;
  suitableMissed: number;
  hard: number;
  hardBlocked: number;
  hardViolated: number;
  needsInfo: number;
  needsInfoAsked: number;
  reasonsExpected: number;
  reasonsRight: number;
}

export function tally(
  rows: Array<{ item: LabeledBrief; got: Outcome; rules: string[] | null }>
): Tally {
  const t: Tally = {
    total: rows.length,
    agree: 0,
    suggested: 0,
    suggestedRight: 0,
    suitable: 0,
    suitableMissed: 0,
    hard: 0,
    hardBlocked: 0,
    hardViolated: 0,
    needsInfo: 0,
    needsInfoAsked: 0,
    reasonsExpected: 0,
    reasonsRight: 0,
  };
  for (const { item, got, rules } of rows) {
    if (got === item.label) t.agree += 1;
    if (got === "would_consider") {
      t.suggested += 1;
      if (item.label === "would_consider") t.suggestedRight += 1;
    }
    if (item.label === "would_consider") {
      t.suitable += 1;
      if (got !== "would_consider") t.suitableMissed += 1;
    }
    if (item.hard) {
      t.hard += 1;
      if (got === "would_decline") t.hardBlocked += 1;
      if (got === "would_consider") t.hardViolated += 1;
    }
    if (item.label === "needs_info") {
      t.needsInfo += 1;
      if (got === "needs_info") t.needsInfoAsked += 1;
    }
    if (rules && item.expectedRule) {
      t.reasonsExpected += 1;
      if (rules.includes(item.expectedRule)) t.reasonsRight += 1;
    }
  }
  return t;
}

export interface CalibrationRun {
  ruleVersion: string;
  rows: Array<{
    item: LabeledBrief;
    baseline: Outcome;
    workflow: Outcome;
    rules: string[];
    reasons: string[];
    evidenceComplete: boolean;
    dedupeKey: string | null;
    inputHash: string | null;
  }>;
}

export async function runCalibration(
  preferences: Record<string, unknown> = MAYA_PREFERENCES
): Promise<CalibrationRun> {
  const profile = mayaFacts(preferences);
  const result = await evaluateBriefsForProfile(
    BRIEFS.map((b) => b.brief),
    profile,
    { now: CALIBRATION_NOW, model: null, source: "fixture" }
  );
  return {
    ruleVersion: result.ruleVersion,
    rows: BRIEFS.map((item, index) => {
      const assessed = result.items[index];
      const evaluation = assessed.evaluation;
      // Every objection and every question must name the fields it read.
      const evidenceComplete = evaluation
        ? [...evaluation.ruleFailures, ...evaluation.unknowns, ...evaluation.rulesPassed].every(
            (r) => r.fields.length > 0
          )
        : true;
      return {
        item,
        baseline: baseline(item, profile, CALIBRATION_NOW),
        workflow: outcomeOf(assessed),
        rules: objecting(assessed),
        reasons: assessed.reasons,
        evidenceComplete,
        dedupeKey: assessed.dedupeKey,
        inputHash: evaluation?.inputHash ?? null,
      };
    }),
  };
}
