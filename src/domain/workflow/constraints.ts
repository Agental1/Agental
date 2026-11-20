import { PROTECTED_REQUIREMENTS, type NormalizedBrief, type ProtectedRequirement } from "./brief";
import { recordFields, summarizeRules, type RuleResult, type RulesResult } from "./fit";
import type { AvailabilityWindow, ProfileFacts } from "./profile";
import { foldLabel } from "./text";

/**
 * Deterministic constraints. They run before anything else and need no model.
 *
 * Each rule reads named fields and answers pass, fail or unknown:
 *
 *   - fail     the record objectively rules the brief out. One failure makes
 *              the decision ineligible, and nothing later may raise it.
 *   - unknown  a fact is missing, on either side. The rule says what to ask.
 *              A missing fact is never filled in with a guess.
 *   - pass     the record objectively satisfies the rule.
 *
 * What the rules never read: images, voice recordings, and protected traits
 * (age beyond the 18+ gate, ethnicity, gender, disability, appearance). When
 * a brief states a requirement about one of those, the rule's whole answer
 * is a question for the human.
 *
 * Bump RULE_VERSION whenever a rule changes what it answers for the same
 * input. The version is part of each evaluation's input hash, so a change
 * leads to fresh evaluations and old ones stay attributable.
 */
export const RULE_VERSION = "rules-2026-11-19.2";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dayNumber(isoDay: string): number {
  return Math.round(Date.parse(`${isoDay}T00:00:00Z`) / DAY_MS);
}

/* ── brief_open ────────────────────────────────────────────────────────── */

/**
 * Is the brief known to be closed at `now`? The one answer in the rules that
 * the clock alone can change, which is why it is part of the input hash.
 */
export function briefClosed(brief: NormalizedBrief, now: Date): boolean {
  return briefOpen(brief, now).status === "fail";
}

function briefOpen(brief: NormalizedBrief, now: Date): RuleResult {
  const rule = "brief_open";
  if (brief.status !== "ACTIVE") {
    return {
      rule,
      status: "fail",
      fields: ["brief.status"],
      reason: "The brief is closed.",
    };
  }
  if (brief.expiresAt) {
    const open = brief.expiresAt.getTime() > now.getTime();
    return {
      rule,
      status: open ? "pass" : "fail",
      fields: ["brief.expiresAt"],
      reason: open
        ? `The brief is open until ${dayOf(brief.expiresAt)}.`
        : `The brief closed on ${dayOf(brief.expiresAt)}.`,
    };
  }
  const lastDay = brief.endsOn ?? brief.startsOn;
  if (lastDay && dayOf(lastDay) < dayOf(now)) {
    return {
      rule,
      status: "fail",
      fields: ["brief.expiresAt", brief.endsOn ? "brief.endsOn" : "brief.startsOn"],
      reason: "The work dates in the brief have passed.",
    };
  }
  return {
    rule,
    status: "unknown",
    fields: ["brief.expiresAt"],
    reason: "The brief gives no closing date.",
    question: "The brief gives no closing date. Is it still open?",
    modelMaySettle: false,
  };
}

/* ── adult ─────────────────────────────────────────────────────────────── */

function adult(profile: ProfileFacts): RuleResult {
  return {
    rule: "adult",
    status: profile.isAdult ? "pass" : "fail",
    fields: ["profile.isAdult"],
    reason: profile.isAdult
      ? "The performer is an adult."
      : "Adult status is not established for this profile.",
    // The gate is a yes or a no, cited without any date.
    excerpts: { "profile.isAdult": null },
  };
}

/* ── role_type ─────────────────────────────────────────────────────────── */

function roleType(brief: NormalizedBrief, profile: ProfileFacts): RuleResult {
  const rule = "role_type";
  const fields = ["brief.roleType", "profile.specialties"];
  const kinds = profile.specialties.map((specialty) => specialty.kind);
  if (!brief.roleType) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief does not name a role type.",
      question: "The brief does not name a role type. Is this a kind of role you take?",
      // The role name and the description may make the type plain.
      modelMaySettle: kinds.length > 0,
    };
  }
  if (kinds.length === 0) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The profile lists no specialty.",
      question: `Your profile lists no specialty. Do you take roles of type "${brief.roleType}"?`,
      modelMaySettle: false,
    };
  }
  const match = kinds.includes(brief.roleType);
  return {
    rule,
    status: match ? "pass" : "fail",
    fields,
    reason: match
      ? `The role type (${brief.roleType}) is among the profile's specialties.`
      : `The role type (${brief.roleType}) is not among the profile's specialties.`,
    excerpts: { "profile.specialties": kinds.join(", ") },
  };
}

/* ── location ──────────────────────────────────────────────────────────── */

function location(brief: NormalizedBrief, profile: ProfileFacts): RuleResult {
  const rule = "location";
  if (brief.remote === true) {
    return {
      rule,
      status: "pass",
      fields: ["brief.remote"],
      reason: "The work is remote.",
    };
  }
  if (brief.country) {
    const fields = ["brief.country", "profile.mobilityCountries"];
    if (profile.mobilityCountries.length === 0) {
      return {
        rule,
        status: "unknown",
        fields,
        reason: "The profile lists no country where the performer works.",
        question: `Your profile lists no country where you work. Can you work in ${brief.country}?`,
        modelMaySettle: false,
      };
    }
    const match = profile.mobilityCountries.includes(brief.country);
    return {
      rule,
      status: match ? "pass" : "fail",
      fields,
      reason: match
        ? `The work is in ${brief.country}, a country the profile lists.`
        : `The work is in ${brief.country}, which is not among the countries the profile lists.`,
    };
  }
  if (brief.location) {
    const fields = ["brief.location", "brief.country", "profile.city"];
    if (profile.city && foldLabel(profile.city) === foldLabel(brief.location)) {
      return {
        rule,
        status: "pass",
        fields,
        reason: "The work is in the performer's city.",
      };
    }
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief names a place and no country.",
      question: "The brief names a place and no country. Can you work there?",
      modelMaySettle: false,
    };
  }
  return {
    rule,
    status: "unknown",
    fields: ["brief.location", "brief.country", "brief.remote"],
    reason: "The brief does not say where the work takes place.",
    question: "The brief does not say where the work takes place. Find out before deciding.",
    modelMaySettle: false,
  };
}

/* ── availability ──────────────────────────────────────────────────────── */

function windowApplies(window: AvailabilityWindow, brief: NormalizedBrief): boolean {
  if (window.zones.length === 0) return true;
  const country = foldLabel(brief.country);
  const place = foldLabel(brief.location);
  return window.zones.some((zone) => {
    const folded = foldLabel(zone);
    if (folded.length < 2) return false;
    return folded === country || (place.length > 0 && ` ${place} `.includes(` ${folded} `));
  });
}

function describeWindows(windows: AvailabilityWindow[]): string {
  return windows
    .slice(0, 4)
    .map((window) => `${window.type} ${window.from} to ${window.to}`)
    .join("; ");
}

function availability(brief: NormalizedBrief, profile: ProfileFacts): RuleResult {
  const rule = "availability";
  const fields = ["brief.startsOn", "brief.endsOn", "profile.availability"];
  if (!brief.startsOn) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief gives no start date.",
      question: "The brief gives no start date. When is the work, and are you free?",
      modelMaySettle: false,
      excerpts: { "profile.availability": null },
    };
  }
  const start = dayOf(brief.startsOn);
  const end = brief.endsOn ? dayOf(brief.endsOn) : start;
  const span = start === end ? `on ${start}` : `from ${start} to ${end}`;
  const overlapping = profile.availability.filter(
    (window) => window.from <= end && window.to >= start
  );

  const blocked = overlapping.filter((window) => window.type === "UNAVAILABLE");
  const blockedHere = blocked.filter((window) => windowApplies(window, brief));
  if (blockedHere.length > 0) {
    return {
      rule,
      status: "fail",
      fields,
      reason: `The work is ${span} and overlaps a period the profile marks unavailable.`,
      excerpts: { "profile.availability": describeWindows(blockedHere) },
    };
  }
  if (blocked.length > 0) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: `The work is ${span} and overlaps a period marked unavailable for other places.`,
      question: `You marked a period unavailable for certain places. Does it also rule out work ${span}?`,
      modelMaySettle: false,
      excerpts: { "profile.availability": describeWindows(blocked) },
    };
  }

  // Do the available windows, taken together, cover every day of the work?
  const free = overlapping
    .filter((window) => window.type === "AVAILABLE" && windowApplies(window, brief))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  let cursor = dayNumber(start);
  const last = dayNumber(end);
  for (const window of free) {
    if (dayNumber(window.from) > cursor) break;
    cursor = Math.max(cursor, dayNumber(window.to) + 1);
  }
  if (cursor > last) {
    return {
      rule,
      status: "pass",
      fields,
      reason: `The work is ${span}, inside a period the profile marks available.`,
      excerpts: { "profile.availability": describeWindows(free) },
    };
  }
  return {
    rule,
    status: "unknown",
    fields,
    reason: `The profile records no availability covering the work ${span}.`,
    question: `Are you free ${span}?`,
    modelMaySettle: false,
    excerpts: { "profile.availability": free.length > 0 ? describeWindows(free) : null },
  };
}

/* ── explicit preferences ──────────────────────────────────────────────── */

function preference(
  name: "nudity" | "animals",
  label: string,
  brief: NormalizedBrief,
  profile: ProfileFacts
): RuleResult | null {
  if (brief.requirements[name] !== true) return null;
  const fields = [`brief.requirements.${name}`, `preferences.${name}`];
  const answer = profile.preferences[name];
  if (answer === null) {
    return {
      rule: name,
      status: "unknown",
      fields,
      reason: `The role involves ${label} and the profile records no preference about it.`,
      question: `The role involves ${label}. Do you accept that?`,
      modelMaySettle: false,
    };
  }
  return {
    rule: name,
    status: answer ? "pass" : "fail",
    fields,
    reason: answer
      ? `The role involves ${label}, which the performer's preferences accept.`
      : `The role involves ${label}, which the performer's preferences decline.`,
  };
}

/* ── paid or unpaid ────────────────────────────────────────────────────── */

/** Applies to a brief that says it is unpaid. */
function compensation(brief: NormalizedBrief, profile: ProfileFacts): RuleResult | null {
  if (brief.paid !== false) return null;
  const rule = "compensation";
  const fields = ["brief.paid", "preferences.compensation"];
  const answer = profile.preferences.compensation;
  if (answer === null) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief is unpaid and the profile records no preference about unpaid work.",
      question: "This brief is unpaid. Do you take unpaid work?",
      modelMaySettle: false,
    };
  }
  return {
    rule,
    status: answer === "paid_or_unpaid" ? "pass" : "fail",
    fields,
    reason:
      answer === "paid_or_unpaid"
        ? "The brief is unpaid, which the performer's preferences accept."
        : "The brief is unpaid and the performer's preferences are for paid work only.",
  };
}

/* ── rate ──────────────────────────────────────────────────────────────── */

function rate(brief: NormalizedBrief, profile: ProfileFacts): RuleResult | null {
  // The rule only applies when the profile states a minimum.
  if (profile.minRateCents === null) return null;
  const rule = "rate";
  const fields = ["brief.paid", "brief.rateCents", "profile.minRateCents"];
  if (brief.paid === false) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief is unpaid and the profile sets a minimum rate.",
      question: "This brief is unpaid and you set a minimum rate. Do you want to consider it?",
      modelMaySettle: false,
    };
  }
  if (brief.rateCents === null) {
    return {
      rule,
      status: "unknown",
      fields,
      reason: "The brief gives no rate and the profile sets a minimum rate.",
      question: "The brief gives no rate. Is the pay acceptable to you?",
      modelMaySettle: false,
    };
  }
  if (brief.rateCents >= profile.minRateCents) {
    return {
      rule,
      status: "pass",
      fields,
      reason: "The stated rate is at or above the profile's minimum rate.",
    };
  }
  // A brief has no column for the period or the currency of its rate, so a
  // lower figure cannot be called a failure: a day rate and a project fee
  // do not compare.
  return {
    rule,
    status: "unknown",
    fields,
    reason:
      "The stated rate is below the profile's minimum rate, and the brief does not say what period or currency it covers.",
    question: "The stated rate looks lower than your minimum rate. Is the pay acceptable to you?",
    modelMaySettle: false,
    missingField: "Brief.rateUnit, Brief.currency",
  };
}

/* ── languages and skills ──────────────────────────────────────────────── */

function missingLabels(required: string[], declared: string[]): string[] {
  const have = new Set(declared.map(foldLabel));
  return required.filter((label) => !have.has(foldLabel(label)));
}

function languages(brief: NormalizedBrief, profile: ProfileFacts): RuleResult | null {
  const required = brief.requirements.languages ?? [];
  if (required.length === 0) return null;
  const fields = ["brief.requirements.languages", "profile.languages"];
  const missing = missingLabels(required, profile.languages);
  if (missing.length === 0) {
    return {
      rule: "languages",
      status: "pass",
      fields,
      reason: "Every language the role asks for is among the profile's languages.",
    };
  }
  // The profile lists languages as free text and has no way to say "I do
  // not speak this", so a language that is not found is a question.
  return {
    rule: "languages",
    status: "unknown",
    fields,
    reason: `The profile does not list every language the role asks for (${missing.join(", ")}).`,
    question: `The role asks for: ${missing.join(", ")}. Do you speak ${missing.length > 1 ? "them" : "it"}?`,
    // A declared language may be spelled differently ("anglais", "English").
    modelMaySettle: profile.languages.length > 0,
  };
}

function skills(brief: NormalizedBrief, profile: ProfileFacts): RuleResult | null {
  const required = brief.requirements.skills ?? [];
  if (required.length === 0) return null;
  const fields = ["brief.requirements.skills", "profile.specialties"];
  const tags = profile.specialties.flatMap((specialty) => specialty.tags);
  const missing = missingLabels(required, tags);
  if (missing.length === 0) {
    return {
      rule: "skills",
      status: "pass",
      fields,
      reason: "Every skill the role asks for is among the profile's specialty tags.",
      excerpts: { "profile.specialties": tags.join(", ") },
    };
  }
  return {
    rule: "skills",
    status: "unknown",
    fields,
    reason: `The profile does not record every skill the role asks for (${missing.join(", ")}).`,
    question: `The role asks for: ${missing.join(", ")}. Do you have ${missing.length > 1 ? "these skills" : "this skill"}?`,
    // A skill is never inferred.
    modelMaySettle: false,
    excerpts: { "profile.specialties": tags.length > 0 ? tags.join(", ") : null },
  };
}

/* ── facts the profile cannot hold ─────────────────────────────────────── */

function unionStatus(brief: NormalizedBrief): RuleResult | null {
  if (!brief.unionStatus) return null;
  return {
    rule: "union_status",
    status: "unknown",
    fields: ["brief.unionStatus"],
    reason: "The brief states a union status and the profile has no field for union membership.",
    question: "The brief states a union status. Does yours match?",
    modelMaySettle: false,
    missingField: "ArtistProfile.unionStatus",
  };
}

function workAuthorization(brief: NormalizedBrief): RuleResult | null {
  const countries = brief.requirements.workAuthorization ?? [];
  if (countries.length === 0) return null;
  return {
    rule: "work_authorization",
    status: "unknown",
    fields: ["brief.requirements.workAuthorization"],
    reason: "The brief requires the right to work and the profile has no field for it.",
    question: `The role requires the right to work in: ${countries.join(", ")}. Do you have it?`,
    modelMaySettle: false,
    missingField: "ArtistProfile.workAuthorization",
  };
}

const PROTECTED_LABEL: Record<ProtectedRequirement, string> = {
  playingAge: "age",
  gender: "gender",
  ethnicity: "ethnicity",
  disability: "disability",
  appearance: "appearance",
  voice: "voice",
};

function protectedTraits(brief: NormalizedBrief): RuleResult[] {
  const out: RuleResult[] = [];
  for (const trait of PROTECTED_REQUIREMENTS) {
    if (!brief.requirements[trait]) continue;
    out.push({
      rule: `protected:${trait}`,
      status: "unknown",
      fields: [`brief.requirements.${trait}`],
      reason: `The brief states a requirement about ${PROTECTED_LABEL[trait]}. Agental does not assess it.`,
      question: `The brief states a requirement about ${PROTECTED_LABEL[trait]}. Agental does not assess it. Read the brief and decide for yourself.`,
      modelMaySettle: false,
    });
  }
  return out;
}

function otherRequirements(brief: NormalizedBrief): RuleResult | null {
  const other = brief.requirements.other ?? [];
  if (other.length === 0) return null;
  const count = other.length === 1 ? "one other requirement" : `${other.length} other requirements`;
  return {
    rule: "other_requirements",
    status: "unknown",
    fields: ["brief.requirements.other"],
    reason: `The brief lists ${count} that no rule covers.`,
    question: `The brief lists ${count} that no rule covers. Read ${other.length === 1 ? "it" : "them"} before deciding.`,
    modelMaySettle: false,
  };
}

/* ── all rules ─────────────────────────────────────────────────────────── */

/** Run every rule that applies, in a fixed order. */
export function runRules(
  brief: NormalizedBrief,
  profile: ProfileFacts,
  now: Date
): RuleResult[] {
  const results: Array<RuleResult | null> = [
    briefOpen(brief, now),
    adult(profile),
    roleType(brief, profile),
    location(brief, profile),
    availability(brief, profile),
    preference("nudity", "nudity", brief, profile),
    preference("animals", "working with animals", brief, profile),
    compensation(brief, profile),
    rate(brief, profile),
    languages(brief, profile),
    skills(brief, profile),
    unionStatus(brief),
    workAuthorization(brief),
    ...protectedTraits(brief),
    otherRequirements(brief),
  ];
  return results.filter((result): result is RuleResult => result !== null);
}

/**
 * The rules-only assessment of one brief for one performer: the decision,
 * each rule's outcome, and the six arrays as they are stored.
 */
export function evaluateConstraints(
  brief: NormalizedBrief,
  profile: ProfileFacts,
  now: Date
): RulesResult {
  return summarizeRules(RULE_VERSION, runRules(brief, profile, now), recordFields(brief, profile));
}

/** Schema fields a rule would need and that do not exist yet. */
export function missingFields(rules: RuleResult[]): string[] {
  return [...new Set(rules.flatMap((rule) => (rule.missingField ? [rule.missingField] : [])))];
}
