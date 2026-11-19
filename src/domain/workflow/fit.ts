import { z } from "zod";
import { PROTECTED_REQUIREMENTS, type NormalizedBrief } from "./brief";
import type { ProfileFacts } from "./profile";
import { cleanLine, foldLabel, truncate } from "./text";

/**
 * The shape of a fit suggestion: what is stored on a FitEvaluation row, what
 * the model must return, and how a model answer is checked before it is
 * allowed anywhere near a decision.
 *
 * This file stays free of node:crypto, so a client component may import
 * these types.
 */

export const Decision = z.enum(["eligible", "needs_review", "ineligible"]);
export type Decision = z.infer<typeof Decision>;

const RANK: Record<Decision, number> = { ineligible: 0, needs_review: 1, eligible: 2 };

/** The more cautious of two decisions. */
export function lowerDecision(a: Decision, b: Decision): Decision {
  return RANK[a] <= RANK[b] ? a : b;
}

/* ── Stored items (the six JSON columns of FitEvaluation) ──────────────── */

const ItemSource = z.enum(["rules", "model"]);
const FieldName = z.string().min(1).max(80);
const Fields = z.array(FieldName).max(12);

export const RulePassedItem = z.object({
  rule: z.string().min(1).max(80),
  fields: Fields,
  source: ItemSource,
});
export type RulePassedItem = z.infer<typeof RulePassedItem>;

export const RuleFailureItem = z.object({
  rule: z.string().min(1).max(80),
  reason: z.string().max(400),
  fields: Fields,
  source: ItemSource,
});
export type RuleFailureItem = z.infer<typeof RuleFailureItem>;

export const UnknownItem = z.object({
  rule: z.string().min(1).max(80),
  /** What the human is asked to settle. */
  question: z.string().max(400),
  fields: Fields,
  source: ItemSource,
});
export type UnknownItem = z.infer<typeof UnknownItem>;

export const EvidenceItem = z.object({
  /** For example "brief.roleType" or "profile.specialties". */
  field: FieldName,
  /** The part of that field's value that was relied on, when there is one. */
  excerpt: z.string().max(300).nullable(),
  source: ItemSource,
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

/**
 * Read one of the stored JSON columns. Anything unreadable gives an empty
 * list, and an item of the wrong shape is dropped on its own.
 */
export function parseStoredList<T>(schema: z.ZodType<T>, raw: string | null | undefined): T[] {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const Reason = z.string().min(1).max(400);

/** Read the stored `reasons` column. */
export function parseStoredReasons(raw: string | null | undefined): string[] {
  return parseStoredList(Reason, raw);
}

/* ── What the model is given ───────────────────────────────────────────── */

/**
 * The record handed to the model: the structured brief, the permissioned
 * profile fields, the explicit preferences, and what the rules already
 * found. It is sent as JSON in the user turn and is the whole of what the
 * model may cite.
 */
export interface FitInput {
  brief: Record<string, unknown>;
  profile: Record<string, unknown>;
  preferences: Record<string, unknown>;
  rules: {
    ruleVersion: string;
    decision: Decision;
    passed: Array<{ rule: string; fields: string[] }>;
    failed: Array<{ rule: string; reason: string; fields: string[] }>;
    unknown: Array<{ rule: string; question: string; fields: string[] }>;
  };
}

function day(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Every field a rule may read, by the name used to cite it. The model sees a
 * subset (see modelFields): requirements about protected traits, the brief
 * status and the 18+ answer stay with the rules.
 */
export function recordFields(
  brief: NormalizedBrief,
  profile: ProfileFacts
): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  fields.set("brief.title", brief.title);
  fields.set("brief.production", brief.production);
  fields.set("brief.roleName", brief.roleName);
  fields.set("brief.roleType", brief.roleType);
  fields.set("brief.description", brief.description || null);
  fields.set("brief.location", brief.location);
  fields.set("brief.country", brief.country);
  fields.set("brief.remote", brief.remote);
  fields.set("brief.startsOn", day(brief.startsOn));
  fields.set("brief.endsOn", day(brief.endsOn));
  fields.set("brief.paid", brief.paid);
  fields.set("brief.rateCents", brief.rateCents);
  fields.set("brief.unionStatus", brief.unionStatus);
  fields.set("brief.expiresAt", brief.expiresAt ? brief.expiresAt.toISOString() : null);
  fields.set("brief.status", brief.status);
  const requirements = brief.requirements;
  fields.set("brief.requirements.languages", requirements.languages ?? null);
  fields.set("brief.requirements.skills", requirements.skills ?? null);
  fields.set("brief.requirements.nudity", requirements.nudity ?? null);
  fields.set("brief.requirements.animals", requirements.animals ?? null);
  fields.set("brief.requirements.workAuthorization", requirements.workAuthorization ?? null);
  fields.set("brief.requirements.other", requirements.other ?? null);
  for (const trait of PROTECTED_REQUIREMENTS) {
    fields.set(`brief.requirements.${trait}`, requirements[trait] ?? null);
  }

  fields.set("profile.isAdult", profile.isAdult);
  fields.set("profile.city", profile.city);
  fields.set("profile.mobilityCountries", profile.mobilityCountries);
  fields.set("profile.specialties", profile.specialties);
  fields.set("profile.languages", profile.languages);
  fields.set("profile.minRateCents", profile.minRateCents);
  fields.set("profile.availability", profile.availability);
  fields.set("preferences.nudity", profile.preferences.nudity);
  fields.set("preferences.animals", profile.preferences.animals);
  fields.set("preferences.projectTypes", profile.preferences.projectTypes);
  fields.set("preferences.compensation", profile.preferences.compensation);
  return fields;
}

const HIDDEN_FROM_MODEL: ReadonlySet<string> = new Set([
  "brief.status",
  "profile.isAdult",
  ...PROTECTED_REQUIREMENTS.map((trait) => `brief.requirements.${trait}`),
]);

/** The fields the model receives and may cite. */
export function modelFields(
  brief: NormalizedBrief,
  profile: ProfileFacts
): Map<string, unknown> {
  const visible = new Map<string, unknown>();
  for (const [name, value] of recordFields(brief, profile)) {
    if (!HIDDEN_FROM_MODEL.has(name)) visible.set(name, value);
  }
  return visible;
}

/** Nest "brief.requirements.languages" style names back into objects. */
function nest(fields: Map<string, unknown>, group: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of fields) {
    const [head, ...rest] = name.split(".");
    if (head !== group) continue;
    let target = out;
    for (const part of rest.slice(0, -1)) {
      target[part] = (target[part] as Record<string, unknown> | undefined) ?? {};
      target = target[part] as Record<string, unknown>;
    }
    target[rest[rest.length - 1]] = value;
  }
  return out;
}

export function buildFitInput(
  brief: NormalizedBrief,
  profile: ProfileFacts,
  rules: {
    ruleVersion: string;
    decision: Decision;
    rulesPassed: RulePassedItem[];
    ruleFailures: RuleFailureItem[];
    unknowns: UnknownItem[];
  }
): FitInput {
  const fields = modelFields(brief, profile);
  // A rule that read a hidden field is left out of the summary too: the
  // model is told nothing about a protected requirement, not even that one
  // exists.
  const visible = (item: { fields: string[] }) =>
    item.fields.every((name) => fields.has(name));
  return {
    brief: nest(fields, "brief"),
    profile: nest(fields, "profile"),
    preferences: nest(fields, "preferences"),
    rules: {
      ruleVersion: rules.ruleVersion,
      decision: rules.decision,
      passed: rules.rulesPassed.filter(visible).map(({ rule, fields: f }) => ({ rule, fields: f })),
      failed: rules.ruleFailures
        .filter(visible)
        .map(({ rule, reason, fields: f }) => ({ rule, reason, fields: f })),
      unknown: rules.unknowns
        .filter(visible)
        .map(({ rule, question, fields: f }) => ({ rule, question, fields: f })),
    },
  };
}

/* ── What the model must return ────────────────────────────────────────── */

const ModelText = (max: number) => z.string().min(1).max(max);

/**
 * The JSON the model answers with. Strict: an extra key, a missing array or
 * an over-long string makes the whole answer invalid.
 */
export const FitModelOutput = z.strictObject({
  decision: Decision,
  rules_passed: z
    .array(z.strictObject({ rule: ModelText(80), fields: Fields }))
    .max(20),
  rule_failures: z
    .array(z.strictObject({ rule: ModelText(80), reason: ModelText(400), fields: Fields }))
    .max(20),
  unknowns: z
    .array(z.strictObject({ question: ModelText(400), fields: Fields }))
    .max(20),
  reasons: z.array(ModelText(300)).max(10),
  profile_evidence: z
    .array(z.strictObject({ field: FieldName, excerpt: z.string().max(300).nullable() }))
    .max(20),
  brief_evidence: z
    .array(z.strictObject({ field: FieldName, excerpt: z.string().max(300).nullable() }))
    .max(20),
});
export type FitModelOutput = z.infer<typeof FitModelOutput>;

export type ModelOutputError = "invalid_json" | "invalid_schema";

/** Parse a model answer. A JSON object, optionally inside one code fence. */
export function parseModelOutput(
  text: string
): { ok: true; output: FitModelOutput } | { ok: false; error: ModelOutputError } {
  let body = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(body);
  if (fenced) body = fenced[1].trim();
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const parsed = FitModelOutput.safeParse(value);
  return parsed.success
    ? { ok: true, output: parsed.data }
    : { ok: false, error: "invalid_schema" };
}

/** Words of a structured value. Dates and codes stay whole ("2026-12-01"). */
function tokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[\s[\]{}",:;()]+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 0);
}

/**
 * Does `excerpt` occur in `value`? In free text the phrase must be there,
 * compared without case, accents or punctuation. In a list or an object
 * every word of the excerpt must be one of the value's words, so a date, a
 * country or a skill that the record does not hold is caught, while the
 * order in which the model lists them is its own business.
 */
function supports(value: unknown, excerpt: string): boolean {
  if (typeof value === "string") {
    const quoted = foldLabel(excerpt);
    return quoted.length > 0 && foldLabel(value).includes(quoted);
  }
  const have = new Set(tokens(JSON.stringify(value)));
  const wanted = tokens(excerpt);
  return wanted.length > 0 && wanted.every((token) => have.has(token));
}

/** A field name as it may be repeated in a reason: plain characters only. */
function printableField(name: string): string {
  return truncate(name.replace(/[^A-Za-z0-9_.]/g, "?"), 60);
}

/**
 * Check every citation in a model answer against the record it was given.
 *
 * A citation is invented when it names a field that was not in the input,
 * names a field from the wrong side (a profile field as brief evidence), or
 * quotes an excerpt that does not occur in that field's value. Returns the
 * offending field names, empty when the answer only cites what it was given.
 */
export function inventedEvidence(output: FitModelOutput, input: FitInput): string[] {
  const fields = new Map<string, unknown>();
  const flatten = (group: string, value: Record<string, unknown>) => {
    for (const [key, inner] of Object.entries(value)) {
      const name = `${group}.${key}`;
      if (
        group === "brief" &&
        key === "requirements" &&
        inner !== null &&
        typeof inner === "object" &&
        !Array.isArray(inner)
      ) {
        flatten(name, inner as Record<string, unknown>);
      } else {
        fields.set(name, inner);
      }
    }
  };
  flatten("brief", input.brief);
  flatten("profile", input.profile);
  flatten("preferences", input.preferences);

  const problems: string[] = [];
  const flag = (name: string) => {
    const printable = printableField(name);
    if (!problems.includes(printable)) problems.push(printable);
  };

  const named = [
    ...output.rules_passed.flatMap((item) => item.fields),
    ...output.rule_failures.flatMap((item) => item.fields),
    ...output.unknowns.flatMap((item) => item.fields),
  ];
  for (const name of named) {
    if (!fields.has(name)) flag(name);
  }

  const checkEvidence = (
    items: FitModelOutput["brief_evidence"],
    groups: string[]
  ) => {
    for (const item of items) {
      const inGroup = groups.some((group) => item.field.startsWith(`${group}.`));
      if (!inGroup || !fields.has(item.field)) {
        flag(item.field);
        continue;
      }
      if (item.excerpt === null) continue;
      const value = fields.get(item.field);
      const empty =
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0);
      if (empty || !supports(value, item.excerpt)) flag(item.field);
    }
  };
  checkEvidence(output.brief_evidence, ["brief"]);
  checkEvidence(output.profile_evidence, ["profile", "preferences"]);

  return problems;
}

/* ── Combining the rules with a model answer ───────────────────────────── */

/** Why an item was decided on the rules alone although a model was wanted. */
export type FallbackReason =
  | "limit:model_calls_per_run"
  | "limit:cost_per_run"
  | "limit:cost_per_day"
  | "input_too_large"
  | "model_timeout"
  | "model_error"
  | "model_refused"
  | "model_invalid_output";

export type ModelAnswer =
  /** The model is off, or the rules had already decided. */
  | { kind: "none" }
  /** A model answer was wanted and none could be used. */
  | { kind: "fallback"; reason: FallbackReason }
  /** A well-formed answer, with the citations found to be invented. */
  | { kind: "answer"; output: FitModelOutput; invented: string[] };

/** What happened to an item, for the run record. Performers never see it. */
export type FitNote =
  | FallbackReason
  | "invented_evidence"
  | "model_contradiction"
  | "upgrade_blocked"
  | "needs_person"
  | "model_lowered"
  | "model_settled";

/** One rule's outcome. See ./constraints. */
export interface RuleResult {
  rule: string;
  status: "pass" | "fail" | "unknown";
  /** The field names the rule read. */
  fields: string[];
  /** One short sentence. */
  reason: string;
  /** For an unknown: what the human is asked. */
  question?: string;
  /**
   * For an unknown: true when a model answer with valid evidence may settle
   * it. False for anything that needs the performer, such as a requirement
   * about a protected trait or a fact the profile does not record.
   */
  modelMaySettle?: boolean;
  /** A field the schema would need for this rule to decide. */
  missingField?: string;
  /** Evidence excerpts by field name. A field left out is cited whole. */
  excerpts?: Record<string, string | null>;
}

export interface RulesResult {
  ruleVersion: string;
  decision: Decision;
  rules: RuleResult[];
  rulesPassed: RulePassedItem[];
  ruleFailures: RuleFailureItem[];
  unknowns: UnknownItem[];
  reasons: string[];
  profileEvidence: EvidenceItem[];
  briefEvidence: EvidenceItem[];
}

export interface FitResult {
  decision: Decision;
  rulesDecision: Decision;
  /** What the model said, when it gave a well-formed answer. */
  modelDecision: Decision | null;
  /** True when a model answer was read, even if it was then set aside. */
  modelUsed: boolean;
  ruleVersion: string;
  rulesPassed: RulePassedItem[];
  ruleFailures: RuleFailureItem[];
  unknowns: UnknownItem[];
  reasons: string[];
  profileEvidence: EvidenceItem[];
  briefEvidence: EvidenceItem[];
  notes: FitNote[];
}

const MAX_REASONS = 20;

function excerptOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 0 ? truncate(value, 200) : null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const parts = value.map((item) =>
      item !== null && typeof item === "object"
        ? Object.values(item as Record<string, unknown>)
            .flat()
            .filter((part) => part !== null && part !== "")
            .join(" ")
        : String(item)
    );
    return truncate(parts.join("; "), 200);
  }
  return truncate(JSON.stringify(value), 200);
}

/** Turn rule outcomes into the stored arrays and the rules-only decision. */
export function summarizeRules(
  ruleVersion: string,
  rules: RuleResult[],
  fields: Map<string, unknown>
): RulesResult {
  const failed = rules.filter((rule) => rule.status === "fail");
  const unknown = rules.filter((rule) => rule.status === "unknown");
  const passed = rules.filter((rule) => rule.status === "pass");

  const profileEvidence: EvidenceItem[] = [];
  const briefEvidence: EvidenceItem[] = [];
  for (const rule of [...failed, ...unknown, ...passed]) {
    for (const name of rule.fields) {
      const target = name.startsWith("brief.") ? briefEvidence : profileEvidence;
      if (target.some((item) => item.field === name)) continue;
      const excerpt =
        rule.excerpts && name in rule.excerpts
          ? rule.excerpts[name]
          : excerptOf(fields.get(name));
      target.push({ field: name, excerpt: excerpt ? truncate(excerpt, 300) : null, source: "rules" });
    }
  }

  return {
    ruleVersion,
    decision: failed.length > 0 ? "ineligible" : unknown.length > 0 ? "needs_review" : "eligible",
    rules,
    rulesPassed: passed.map((rule) => ({ rule: rule.rule, fields: rule.fields, source: "rules" })),
    ruleFailures: failed.map((rule) => ({
      rule: rule.rule,
      reason: rule.reason,
      fields: rule.fields,
      source: "rules",
    })),
    unknowns: unknown.map((rule) => ({
      rule: rule.rule,
      question: rule.question ?? rule.reason,
      fields: rule.fields,
      source: "rules",
    })),
    reasons: [...failed, ...unknown, ...passed].map((rule) => rule.reason).slice(0, MAX_REASONS),
    profileEvidence,
    briefEvidence,
  };
}

function fromRules(rules: RulesResult, notes: FitNote[], extraReasons: string[] = []): FitResult {
  return {
    decision: rules.decision,
    rulesDecision: rules.decision,
    modelDecision: null,
    modelUsed: false,
    ruleVersion: rules.ruleVersion,
    rulesPassed: rules.rulesPassed,
    ruleFailures: rules.ruleFailures,
    unknowns: rules.unknowns,
    reasons: [...extraReasons, ...rules.reasons].slice(0, MAX_REASONS),
    profileEvidence: rules.profileEvidence,
    briefEvidence: rules.briefEvidence,
    notes,
  };
}

const modelText = (value: string, max: number) => truncate(cleanLine(value), max);

/**
 * The final suggestion for one brief and one performer.
 *
 * Order of authority, strongest first:
 *   1. A failed rule. The decision is ineligible and stays so.
 *   2. Invented evidence or a self-contradicting answer. The model's content
 *      is set aside and the item goes to a person.
 *   3. An unknown that only a person can settle. The decision cannot rise
 *      above needs_review.
 *   4. The model's own decision, which may lower the rules' decision, and
 *      may raise needs_review to eligible only when every open question was
 *      one a model is allowed to settle and it left none of its own.
 */
export function combineFit(
  rules: RulesResult,
  answer: ModelAnswer,
  fields: Map<string, unknown>
): FitResult {
  if (answer.kind === "none") return fromRules(rules, []);
  if (answer.kind === "fallback") return fromRules(rules, [answer.reason]);

  const { output, invented } = answer;
  const base = { modelDecision: output.decision, modelUsed: true };

  if (rules.decision === "ineligible") {
    const notes: FitNote[] = output.decision === "ineligible" ? [] : ["upgrade_blocked"];
    return { ...fromRules(rules, notes), ...base };
  }

  if (invented.length > 0) {
    const reason = `The model cited information that is not in the record (${invented
      .slice(0, 3)
      .join(", ")}). Its suggestion was set aside and a person should check this one.`;
    return {
      ...fromRules(rules, ["invented_evidence"], [reason]),
      ...base,
      decision: lowerDecision(rules.decision, "needs_review"),
    };
  }

  const evidenceCount = output.profile_evidence.length + output.brief_evidence.length;
  const contradiction =
    (output.decision === "eligible" && output.rule_failures.length > 0) ||
    (output.decision === "ineligible" && output.rule_failures.length === 0) ||
    (output.decision !== "needs_review" && evidenceCount === 0);
  if (contradiction) {
    const reason =
      "The model's answer did not hold together (its decision and its evidence disagree). A person should check this one.";
    return {
      ...fromRules(rules, ["model_contradiction"], [reason]),
      ...base,
      decision: lowerDecision(rules.decision, "needs_review"),
    };
  }

  const notes: FitNote[] = [];
  let decision: Decision;
  let kept = rules;

  if (output.decision === "ineligible") {
    decision = "ineligible";
    notes.push("model_lowered");
  } else if (output.decision === "needs_review") {
    decision = "needs_review";
    if (rules.decision === "eligible") notes.push("model_lowered");
  } else if (rules.decision === "eligible") {
    decision = "eligible";
  } else {
    const open = rules.rules.filter((rule) => rule.status === "unknown");
    const allSettleable = open.every((rule) => rule.modelMaySettle === true);
    if (allSettleable && output.unknowns.length === 0) {
      decision = "eligible";
      notes.push("model_settled");
      kept = summarizeRules(
        rules.ruleVersion,
        rules.rules.filter((rule) => rule.status !== "unknown"),
        fields
      );
    } else {
      decision = "needs_review";
      notes.push("needs_person");
    }
  }

  const extra =
    notes.includes("needs_person")
      ? ["The model saw a fit, but some questions need a person to answer."]
      : [];

  return {
    decision,
    rulesDecision: rules.decision,
    ...base,
    ruleVersion: rules.ruleVersion,
    rulesPassed: [
      ...kept.rulesPassed,
      ...output.rules_passed.map((item) => ({
        rule: modelText(item.rule, 80) || "model",
        fields: item.fields,
        source: "model" as const,
      })),
    ],
    ruleFailures: [
      ...kept.ruleFailures,
      ...output.rule_failures.map((item) => ({
        rule: modelText(item.rule, 80) || "model",
        reason: modelText(item.reason, 400),
        fields: item.fields,
        source: "model" as const,
      })),
    ],
    unknowns: [
      ...kept.unknowns,
      ...output.unknowns.map((item) => ({
        rule: "model",
        question: modelText(item.question, 400),
        fields: item.fields,
        source: "model" as const,
      })),
    ],
    reasons: [
      ...extra,
      ...kept.reasons,
      ...output.reasons.map((reason) => modelText(reason, 300)).filter(Boolean),
    ].slice(0, MAX_REASONS),
    profileEvidence: [
      ...kept.profileEvidence,
      ...output.profile_evidence.map((item) => ({
        field: item.field,
        excerpt: item.excerpt === null ? null : modelText(item.excerpt, 300),
        source: "model" as const,
      })),
    ],
    briefEvidence: [
      ...kept.briefEvidence,
      ...output.brief_evidence.map((item) => ({
        field: item.field,
        excerpt: item.excerpt === null ? null : modelText(item.excerpt, 300),
        source: "model" as const,
      })),
    ],
    notes,
  };
}
