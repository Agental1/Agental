import type { RoleSpec } from "@/domain/json";

/**
 * Conversational brief assistant. The mock is a scripted slot-filler that turns
 * answers into a structured RoleSpec; a real LLM can replace it behind the same
 * question/answer contract. Callers drive the questions client-side.
 */
export interface BriefQuestion {
  key: string;
  prompt: string;
  placeholder?: string;
  kind: "text" | "number" | "choice";
  options?: string[];
  optional?: boolean;
}

export const BRIEF_QUESTIONS: BriefQuestion[] = [
  { key: "title", prompt: "Quel est le titre du projet et du rôle ?", placeholder: "ex. Maxime — série Marée Haute", kind: "text" },
  { key: "role", prompt: "Décrivez le personnage en une phrase.", placeholder: "Pêcheur breton, la trentaine, taiseux", kind: "text" },
  { key: "gender", prompt: "Genre recherché ?", kind: "choice", options: ["H", "F", "Indifférent"] },
  { key: "ageRange", prompt: "Fourchette d'âge ? (ex. 25-32)", placeholder: "25-32", kind: "text" },
  { key: "accent", prompt: "Accent ou langue particulière ?", placeholder: "breton", kind: "text", optional: true },
  { key: "shooting", prompt: "Fenêtre de tournage ? (ex. septembre 2026)", placeholder: "septembre 2026", kind: "text", optional: true },
  { key: "budget", prompt: "Budget indicatif par jour (€) ?", placeholder: "600", kind: "number", optional: true },
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
