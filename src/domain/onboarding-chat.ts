import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { zodError, type ErrorKey } from "./action-result";
import { BirthDateInput } from "./onboarding";
import { HeightInput, formatHeight, ftInToCm, HEIGHT_MAX_CM, HEIGHT_MIN_CM } from "./height";
import { BIO_MAX, ProfileIdentity, ProfilePhysical } from "./profile";
import { BUILDS, EYE_COLORS, GENDERS, HAIR_COLORS, optionKey } from "./identity";
import { LANGUAGES, knownLanguage } from "./languages";
import { AGE_MAX, AGE_MIN, COMPENSATION, PROJECT_TYPES, PreferencesInput, ROLE_TYPES, type Preferences } from "./preferences";
import type { MissingItem } from "./completeness";

/**
 * Round 12, group 6: onboarding as a conversation (docs/ONBOARDING_CHAT_DESIGN.md).
 * Pure rules: the question list, the field mapping with its validation (the
 * forms' own schemas), and the scripted parsers used when no model is on.
 * Every value, from a chip, a rule or the model, passes validateAnswer before
 * anything is saved; the model's value is only a proposal.
 */

export type ChatFieldId =
  | "legalName"
  | "birthDate"
  | "gender"
  | "phone"
  | "city"
  | "languages"
  | "bio"
  | "height"
  | "build"
  | "hair"
  | "eyes"
  | "workTypes"
  | "ageRange"
  | "compensation"
  | "dayRate"
  | "stageName"
  | "weightKg";

export type ChatSave = "identity" | "physical" | "preferences" | "dayRate";

export interface ChatFieldSpec {
  id: ChatFieldId;
  /** chips: tap to answer, never a model call. multi: chips, several. text: typed or spoken. */
  kind: "chips" | "multi" | "text";
  save: ChatSave;
  optional?: boolean;
  /** Only the bio is the performer's own words: the model never reads or writes it. */
  modelReads: boolean;
  /** Allowed values for chips. */
  options?: readonly string[];
}

export const CHAT_FIELDS: Record<ChatFieldId, ChatFieldSpec> = {
  legalName: { id: "legalName", kind: "text", save: "identity", modelReads: true },
  birthDate: { id: "birthDate", kind: "text", save: "identity", modelReads: true },
  gender: { id: "gender", kind: "chips", save: "identity", modelReads: false, options: GENDERS },
  phone: { id: "phone", kind: "text", save: "identity", modelReads: true },
  city: { id: "city", kind: "text", save: "identity", modelReads: true },
  languages: { id: "languages", kind: "text", save: "identity", modelReads: true },
  bio: { id: "bio", kind: "text", save: "identity", modelReads: false },
  height: { id: "height", kind: "text", save: "physical", modelReads: true },
  build: { id: "build", kind: "chips", save: "physical", modelReads: false, options: BUILDS },
  hair: { id: "hair", kind: "chips", save: "physical", modelReads: false, options: HAIR_COLORS },
  eyes: { id: "eyes", kind: "chips", save: "physical", modelReads: false, options: EYE_COLORS },
  workTypes: { id: "workTypes", kind: "multi", save: "preferences", modelReads: false, options: PROJECT_TYPES },
  ageRange: { id: "ageRange", kind: "text", save: "preferences", modelReads: true },
  compensation: { id: "compensation", kind: "chips", save: "preferences", modelReads: false, options: COMPENSATION },
  dayRate: { id: "dayRate", kind: "text", save: "dayRate", modelReads: true },
  stageName: { id: "stageName", kind: "text", save: "identity", optional: true, modelReads: true },
  weightKg: { id: "weightKg", kind: "text", save: "physical", optional: true, modelReads: true },
};

/** Required items that have a chat question; photos stay a button to the upload page. */
const ITEM_TO_FIELD: Partial<Record<MissingItem, ChatFieldId>> = {
  legalName: "legalName",
  birthDate: "birthDate",
  gender: "gender",
  city: "city",
  phone: "phone",
  bio: "bio",
  languages: "languages",
  height: "height",
  build: "build",
  hair: "hair",
  eyes: "eyes",
  workTypes: "workTypes",
  ageRange: "ageRange",
  compensation: "compensation",
  dayRate: "dayRate",
};

/**
 * The questions still to ask, in the order of missingItems (the one 100% rule),
 * without those the performer skipped, then the optional ones (stage name).
 */
export function chatQueue(missing: readonly MissingItem[], opts: { stageNameEmpty: boolean; skipped?: readonly string[] }): ChatFieldId[] {
  const skipped = new Set(opts.skipped ?? []);
  const asked = missing.map((m) => ITEM_TO_FIELD[m]).filter((f): f is ChatFieldId => !!f && !skipped.has(f));
  if (opts.stageNameEmpty && !skipped.has("stageName")) asked.push("stageName");
  return asked;
}

/** Skipped required questions that are still missing: sent to the form at the end. */
export function leftForForm(missing: readonly MissingItem[], skipped: readonly string[]): ChatFieldId[] {
  const s = new Set(skipped);
  return missing.map((m) => ITEM_TO_FIELD[m]).filter((f): f is ChatFieldId => !!f && s.has(f));
}

/* ───────────────────────────── validation ───────────────────────────── */

export type ChatValue = unknown;
export type Validated =
  | { ok: true; save: ChatSave; data: Record<string, unknown> }
  | { ok: false; error: ErrorKey };

const bad = (error: ErrorKey = "errors.invalidInput"): Validated => ({ ok: false, error });
const good = (save: ChatSave, data: Record<string, unknown>): Validated => ({ ok: true, save, data });

const DayRate = z.number().int().min(1).max(100000);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;

/**
 * Check one answer with the forms' own schemas and return what the save action
 * takes. `hair`, `eyes` and `build` are free strings in ProfilePhysical, so
 * they are also checked against their lists here. For preferences the result
 * is a patch: merge it with mergePreferencesPatch before saving.
 */
export function validateAnswer(field: ChatFieldId, value: ChatValue): Validated {
  switch (field) {
    case "legalName": {
      const v = value as { first?: unknown; last?: unknown } | null;
      const first = typeof v?.first === "string" ? v.first.trim() : "";
      const last = typeof v?.last === "string" ? v.last.trim() : "";
      if (!first || !last) return bad("errors.legalNameRequired");
      const p = ProfileIdentity.safeParse({ legalFirstName: first, legalLastName: last });
      return p.success ? good("identity", { legalFirstName: first, legalLastName: last }) : bad("errors.legalNameRequired");
    }
    case "stageName": {
      const s = typeof value === "string" ? value.trim() : "";
      return s && ProfileIdentity.safeParse({ stageName: s }).success ? good("identity", { stageName: s }) : bad();
    }
    case "birthDate": {
      const p = BirthDateInput.safeParse(value);
      return p.success ? good("identity", { birthDate: p.data }) : bad(zodError(p.error).key);
    }
    case "gender": {
      const g = oneOf(value, GENDERS);
      return g ? good("identity", { gender: g }) : bad();
    }
    case "phone": {
      const s = typeof value === "string" ? value.trim() : "";
      const p = ProfileIdentity.safeParse({ phoneE164: s });
      const parsed = p.success ? parsePhoneNumberFromString(s) : undefined;
      return parsed?.isValid() ? good("identity", { phoneE164: s, phone: parsed.formatInternational() }) : bad("errors.phoneInvalid");
    }
    case "city": {
      const id = typeof value === "number" ? value : NaN;
      return Number.isInteger(id) && id > 0 ? good("identity", { cityGeonameId: id }) : bad("errors.cityUnknown");
    }
    case "languages": {
      const list = Array.isArray(value) ? value : [];
      const names = [...new Set(list.map((l) => (typeof l === "string" ? knownLanguage(l) : null)).filter((n): n is string => !!n))];
      return names.length > 0 ? good("identity", { languages: names }) : bad();
    }
    case "bio": {
      const s = typeof value === "string" ? value.trim() : "";
      return s && s.length <= BIO_MAX ? good("identity", { bio: s }) : bad();
    }
    case "height": {
      const p = HeightInput.safeParse(value);
      return p.success ? good("physical", { height: value }) : bad(zodError(p.error).key);
    }
    case "build":
    case "hair":
    case "eyes": {
      const list = field === "build" ? BUILDS : field === "hair" ? HAIR_COLORS : EYE_COLORS;
      const v = oneOf(value, list);
      if (!v) return bad();
      return ProfilePhysical.safeParse({ [field]: v }).success ? good("physical", { [field]: v }) : bad();
    }
    case "weightKg": {
      const p = ProfilePhysical.safeParse({ weightKg: value });
      return typeof value === "number" && p.success ? good("physical", { weightKg: value }) : bad();
    }
    case "workTypes": {
      const v = value as { projectTypes?: unknown; roleTypes?: unknown } | null;
      const pt = (Array.isArray(v?.projectTypes) ? v!.projectTypes : []).filter((x): x is (typeof PROJECT_TYPES)[number] => !!oneOf(x, PROJECT_TYPES));
      const rt = (Array.isArray(v?.roleTypes) ? v!.roleTypes : []).filter((x): x is (typeof ROLE_TYPES)[number] => !!oneOf(x, ROLE_TYPES));
      // An empty list is left out of the patch, so it never wipes the stored one.
      if (pt.length + rt.length === 0) return bad();
      return good("preferences", { ...(pt.length ? { projectTypes: [...new Set(pt)] } : {}), ...(rt.length ? { roleTypes: [...new Set(rt)] } : {}) });
    }
    case "ageRange": {
      const v = value as { min?: unknown; max?: unknown } | null;
      const p = PreferencesInput.safeParse({ playableAgeMin: v?.min, playableAgeMax: v?.max });
      if (!p.success) return bad(zodError(p.error).key);
      if (typeof v?.min !== "number" || typeof v?.max !== "number") return bad();
      return good("preferences", { playableAgeMin: v.min, playableAgeMax: v.max });
    }
    case "compensation": {
      const c = oneOf(value, COMPENSATION);
      return c ? good("preferences", { compensation: c }) : bad();
    }
    case "dayRate": {
      const p = DayRate.safeParse(value);
      return p.success ? good("dayRate", { usd: p.data }) : bad();
    }
  }
}

/**
 * savePreferences stores the WHOLE form: read the current preferences, put the
 * one new value in, send everything. Keeps travel, work modes and animals.
 */
export function mergePreferencesPatch(current: Preferences, patch: Record<string, unknown>) {
  return { ...current, ...patch };
}

/** Keep only values for the field asked: a key the field does not own is dropped (never invent). */
export function onlyAskedField<T extends Record<string, unknown>>(asked: ChatFieldId, values: T): Partial<T> {
  return Object.prototype.hasOwnProperty.call(values, asked) ? ({ [asked]: values[asked] } as Partial<T>) : {};
}

/* ───────────────────────── scripted parsers ───────────────────────── */

const NAME_WORD = /^[\p{L}][\p{L}'’.\-]*$/u;

/** "Ada Lovelace" -> first "Ada", last "Lovelace"; "my name is ..." accepted. Needs two words. */
export function parseName(text: string): { first: string; last: string } | null {
  const cleaned = text.replace(/^\s*(?:my (?:legal )?name is|i am|i'm|it'?s|this is)\s+/i, "").replace(/[.!]+$/, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6 || !words.every((w) => NAME_WORD.test(w))) return null;
  const first = words[0];
  const last = words.slice(1).join(" ");
  return first.length <= 80 && last.length <= 80 ? { first, last } : null;
}

export function parseStageName(text: string): string | null {
  const s = text.trim().replace(/^(?:i go by|i work as|call me)\s+/i, "");
  return s && s.length <= 80 ? s : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (w: string) => {
  const m = w.toLowerCase().replace(/\./g, "");
  const i = MONTHS.findIndex((n) => n === m || (m.length >= 3 && n.startsWith(m)));
  return i < 0 ? 0 : i + 1;
};
const iso = (y: number, m: number, d: number): string | null => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** yyyy-mm-dd, mm/dd/yyyy, "March 3 1990", "3 March 1990" -> yyyy-mm-dd (not yet checked for age). */
export function parseBirthDate(text: string): string | null {
  const s = text.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[1], +m[2]);
  m = /^([A-Za-z.]+) (\d{1,2}) (\d{4})$/.exec(s);
  if (m && monthIndex(m[1])) return iso(+m[3], monthIndex(m[1]), +m[2]);
  m = /^(\d{1,2}) ([A-Za-z.]+) (\d{4})$/.exec(s);
  if (m && monthIndex(m[2])) return iso(+m[3], monthIndex(m[2]), +m[1]);
  return null;
}

/** `5'10`, `5 ft 10`, `5ft`, `178 cm`, `1.78 m`, a bare 3-digit number as centimeters. */
export function parseHeight(text: string): { unit: "imperial"; feet: number; inches: number } | { unit: "metric"; cm: number } | null {
  const s = text.trim().toLowerCase();
  let m = /^(\d)\s*(?:'|’|ft|feet|foot)\s*(?:(\d{1,2})\s*(?:"|”|''|in|inch|inches)?)?$/.exec(s);
  if (m) {
    const feet = +m[1];
    const inches = m[2] ? +m[2] : 0;
    const cm = ftInToCm(feet, inches);
    return inches <= 11 && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM ? { unit: "imperial", feet, inches } : null;
  }
  m = /^(\d{2,3})\s*(?:cm|centimeters?|centimetres?)?$/.exec(s);
  if (m) return +m[1] >= HEIGHT_MIN_CM && +m[1] <= HEIGHT_MAX_CM ? { unit: "metric", cm: +m[1] } : null;
  m = /^(\d)[.,](\d{1,2})\s*m$/.exec(s);
  if (m) {
    const cm = Math.round(parseFloat(`${m[1]}.${m[2]}`) * 100);
    return cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM ? { unit: "metric", cm } : null;
  }
  return null;
}

/** "70 kg" or "154 lb" -> whole kilograms. */
export function parseWeightKg(text: string): number | null {
  const m = /^(\d{2,3})(?:[.,]\d+)?\s*(kg|kilos?|kilograms?|lbs?|pounds?)?$/i.exec(text.trim());
  if (!m) return null;
  const n = +m[1];
  const kg = m[2] && /^(lb|pound)/i.test(m[2]) ? Math.round(n * 0.45359237) : n;
  return kg >= 20 && kg <= 300 ? kg : null;
}

/** A phone number read as a U.S. number unless it carries a country code; E.164 or null. */
export function parsePhone(text: string): string | null {
  const p = parsePhoneNumberFromString(text.trim(), "US");
  return p?.isValid() ? p.number : null;
}

/** "25-35", "25 to 35", "between 25 and 35". */
export function parseAgeRange(text: string): { min: number; max: number } | null {
  const m = /(\d{2})\s*(?:-|–|to|and|through)\s*(\d{2})/i.exec(text);
  if (!m) return null;
  const min = +m[1];
  const max = +m[2];
  return min >= AGE_MIN && max <= AGE_MAX && min <= max ? { min, max } : null;
}

/** "$300", "300 dollars", "300 a day". */
export function parseDayRate(text: string): number | null {
  const m = /^\$?\s*(\d{1,6})(?:\s*(?:usd|dollars?|bucks|a day|per day|\/day))?$/i.exec(text.trim());
  return m && +m[1] >= 1 && +m[1] <= 100000 ? +m[1] : null;
}

/** "English, French and Spanish" -> language names, only the ones we know. */
export function parseLanguages(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/,|;|\band\b|&|\/|\n/i)) {
    const part = raw.trim().replace(/^(?:i speak|speak)\s+/i, "");
    if (!part) continue;
    const exact = knownLanguage(part);
    const loose = exact ?? LANGUAGES.find((l) => l.name.toLowerCase().startsWith(part.toLowerCase()) && part.length >= 3)?.name ?? null;
    if (loose && !out.includes(loose)) out.push(loose);
  }
  return out;
}

/** A typed answer to a chip question: the value itself, or its key ("dark brown"), any case. */
export function parseChip(text: string, options: readonly string[]): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const key = optionKey(t);
  return options.find((o) => o.toLowerCase() === t || optionKey(o) === key) ?? null;
}

/** The rule parser for a field: a proposed value or null. Never saves anything. */
export function parseByRules(field: ChatFieldId, text: string): ChatValue | null {
  const t = text.trim();
  if (!t) return null;
  switch (field) {
    case "legalName": return parseName(t);
    case "stageName": return parseStageName(t);
    case "birthDate": return parseBirthDate(t);
    case "phone": return parsePhone(t);
    case "height": return parseHeight(t);
    case "weightKg": return parseWeightKg(t);
    case "ageRange": return parseAgeRange(t);
    case "dayRate": return parseDayRate(t);
    case "languages": { const l = parseLanguages(t); return l.length ? l : null; }
    case "bio": return t.length <= BIO_MAX ? t : null;
    case "gender": case "build": case "hair": case "eyes": case "compensation":
      return parseChip(t, CHAT_FIELDS[field].options ?? []);
    case "city": return null; // a city is always picked from the list, see the action
    case "workTypes": return null; // chips only
  }
}

/** Input limits (design section 5). */
export const ANSWER_MAX = 1500;
export const ONE_GO_MAX = 6000;

/** Fields the one-go extraction may fill: every mapped key, never the bio or chips-only fields the model has no business guessing. */
export const ONE_GO_FIELDS = ["legalName", "stageName", "birthDate", "gender", "phone", "city", "languages", "height", "build", "hair", "eyes", "workTypes", "ageRange", "compensation"] as const satisfies readonly ChatFieldId[];

/* What the performer reads back */

/** A proposed value as one short line, in a form the rule parsers read back (review screen, confirm step). */
export function formatForReview(field: ChatFieldId, value: unknown): string {
  switch (field) {
    case "legalName": { const v = value as { first?: string; last?: string }; return `${v?.first ?? ""} ${v?.last ?? ""}`.trim(); }
    case "height": {
      const v = value as { unit?: string; cm?: number; feet?: number; inches?: number };
      if (v?.unit === "imperial" && typeof v.feet === "number") return `${v.feet} ft ${v.inches ?? 0} in`;
      return typeof v?.cm === "number" ? formatHeight(v.cm, "en", "imperial") : "";
    }
    case "ageRange": { const v = value as { min?: number; max?: number }; return `${v?.min}-${v?.max}`; }
    case "languages": return Array.isArray(value) ? value.join(", ") : "";
    case "workTypes": { const v = value as { projectTypes?: string[] }; return (v?.projectTypes ?? []).join(", "); }
    case "dayRate": return `$${value}`;
    case "weightKg": return `${value} kg`;
    default: return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
}

/** The edited text of a review row, back to a value: chips by name, text by the rule parsers. */
export function valueFromReviewText(field: ChatFieldId, text: string): ChatValue | null {
  const t = text.trim();
  if (!t) return null;
  if (field === "workTypes") {
    const items = t.split(/[,;]+/).map((x) => parseChip(x, PROJECT_TYPES)).filter((x): x is string => !!x);
    return items.length ? { projectTypes: items, roleTypes: [] } : null;
  }
  if (field === "city") return /^\d+$/.test(t) ? Number(t) : null;
  return parseByRules(field, t);
}
