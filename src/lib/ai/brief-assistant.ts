import type { RoleSpec } from "@/domain/json";

/**
 * Conversational brief assistant. The mock is a scripted slot-filler that turns
 * answers into a structured RoleSpec; a real LLM can replace it behind the same
 * question/answer contract. Callers drive the questions client-side.
 */
export type BriefQuestionKey =
  | "title"
  | "role"
  | "gender"
  | "ageRange"
  | "accent"
  | "shooting"
  | "budget";

export interface BriefQuestion {
  key: BriefQuestionKey;
  kind: "text" | "number" | "choice";
  options?: string[];
  optional?: boolean;
}

/**
 * The wizard's shape, not its words. Prompt and placeholder are looked up from
 * `casting.space.brief.questions.<key>` by the component that renders them —
 * they used to live here as French literals, invisible to the leak scan because
 * a module constant contains no JSX, and a casting director saw them in French
 * whatever language they had chosen.
 *
 * `options` stays as stored values: the gender answer is written into the
 * RoleSpec, so translating it here would put a localised string in the
 * database. The label is translated at render time.
 */
export const BRIEF_QUESTIONS: BriefQuestion[] = [
  { key: "title", kind: "text" },
  { key: "role", kind: "text" },
  { key: "gender", kind: "choice", options: ["H", "F", "Indifférent"] },
  { key: "ageRange", kind: "text" },
  { key: "accent", kind: "text", optional: true },
  { key: "shooting", kind: "text", optional: true },
  { key: "budget", kind: "number", optional: true },
];

export interface BriefAnswers {
  title?: string;
  role?: string;
  gender?: string;
  ageRange?: string;
  accent?: string;
  shooting?: string;
  budget?: string;
}

export interface BriefResult {
  title: string;
  roleSpec: RoleSpec;
  budgetCents?: number;
}

/** Assemble a validated brief from collected answers (mock). */
export function buildBrief(answers: BriefAnswers): BriefResult {
  const [minS, maxS] = (answers.ageRange ?? "").split(/[-–]/).map((s) => s.trim());
  const ageMin = Number(minS);
  const ageMax = Number(maxS);
  const roleSpec: RoleSpec = {
    role: answers.role || answers.title || "Rôle",
    gender: answers.gender === "Indifférent" ? undefined : answers.gender,
    ageMin: Number.isFinite(ageMin) ? ageMin : undefined,
    ageMax: Number.isFinite(ageMax) ? ageMax : undefined,
    accent: answers.accent || undefined,
    constraints: answers.shooting ? [`Tournage : ${answers.shooting}`] : [],
  };
  const budget = Number(answers.budget);
  return {
    title: answers.title || "Nouveau brief",
    roleSpec,
    budgetCents: Number.isFinite(budget) && budget > 0 ? Math.round(budget * 100) : undefined,
  };
}
