import { describe, expect, it } from "vitest";
import { BriefInput, PROTECTED_REQUIREMENTS } from "@/domain/workflow/brief";
import {
  evaluateConstraints,
  missingFields,
  RULE_VERSION,
  runRules,
} from "@/domain/workflow/constraints";
import { normalizeBrief } from "@/domain/workflow/normalize";
import { toProfileFacts, type ProfileFacts } from "@/domain/workflow/profile";

/**
 * The deterministic rules, one by one: what passes, what fails, and what
 * stays a question. A failure must be objective, and a missing fact must
 * never be guessed.
 */

const now = new Date("2026-11-19T10:00:00Z");

function brief(over: Record<string, unknown> = {}) {
  return normalizeBrief(
    "fixture",
    BriefInput.parse({
      title: "Night Shift",
      roleType: "figuration",
      country: "US",
      startsOn: "2026-12-01",
      endsOn: "2026-12-03",
      expiresAt: "2026-11-30",
      ...over,
    }),
    now
  );
}

function profile(over: Partial<ProfileFacts> = {}): ProfileFacts {
  return {
    profileId: "p1",
    isAdult: true,
    city: "New York",
    mobilityCountries: ["US"],
    specialties: [
      { kind: "figuration", level: "CONFIRMED", tags: [] },
      { kind: "photo", level: "BEGINNER", tags: [] },
    ],
    languages: ["English"],
    minRateCents: null,
    preferences: { nudity: null, animals: null, projectTypes: [], compensation: null },
    availability: [{ from: "2026-11-25", to: "2026-12-10", type: "AVAILABLE", zones: [] }],
    ...over,
  };
}

function rule(name: string, b = brief(), p = profile()) {
  return runRules(b, p, now).find((result) => result.rule === name);
}

describe("the decision", () => {
  it("is eligible when every rule that applies passes", () => {
    const result = evaluateConstraints(brief(), profile(), now);
    expect(result.decision).toBe("eligible");
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.ruleFailures).toEqual([]);
    expect(result.unknowns).toEqual([]);
    expect(result.rulesPassed.map((item) => item.rule)).toEqual([
      "brief_open",
      "adult",
      "role_type",
      "location",
      "availability",
    ]);
  });

  it("is needs_review as soon as one fact is unknown", () => {
    const result = evaluateConstraints(brief({ startsOn: null, endsOn: null }), profile(), now);
    expect(result.decision).toBe("needs_review");
    expect(result.unknowns.map((item) => item.rule)).toEqual(["availability"]);
    expect(result.unknowns[0].question).toMatch(/start date/);
  });

  it("is ineligible on one failure, whatever else is unknown", () => {
    const result = evaluateConstraints(
      brief({ roleType: "voix", startsOn: null, endsOn: null }),
      profile(),
      now
    );
    expect(result.decision).toBe("ineligible");
    expect(result.ruleFailures.map((item) => item.rule)).toEqual(["role_type"]);
  });

  it("names the fields each rule read", () => {
    for (const result of runRules(brief({ requirements: { nudity: true } }), profile(), now)) {
      expect(result.fields.length).toBeGreaterThan(0);
      for (const field of result.fields) expect(field).toMatch(/^(brief|profile|preferences)\./);
    }
  });

  it("cites evidence for what it read, split between brief and profile", () => {
    const result = evaluateConstraints(brief(), profile(), now);
    expect(result.briefEvidence).toContainEqual({
      field: "brief.roleType",
      excerpt: "figuration",
      source: "rules",
    });
    expect(result.profileEvidence).toContainEqual({
      field: "profile.specialties",
      excerpt: "figuration, photo",
      source: "rules",
    });
    expect(result.briefEvidence.every((item) => item.field.startsWith("brief."))).toBe(true);
    expect(result.profileEvidence.every((item) => !item.field.startsWith("brief."))).toBe(true);
  });
});

describe("brief_open", () => {
  it("passes before the closing time", () => {
    expect(rule("brief_open")?.status).toBe("pass");
  });

  it("fails once the closing time has passed", () => {
    const closed = { ...brief(), expiresAt: new Date("2026-11-19T09:59:59Z") };
    expect(rule("brief_open", closed)).toMatchObject({ status: "fail", fields: ["brief.expiresAt"] });
  });

  it("fails for a brief stored as EXPIRED or WITHDRAWN", () => {
    expect(rule("brief_open", { ...brief(), status: "EXPIRED" })?.status).toBe("fail");
    expect(rule("brief_open", { ...brief(), status: "WITHDRAWN" })?.status).toBe("fail");
  });

  it("fails when there is no closing date and the work dates have passed", () => {
    const past = brief({ expiresAt: null, startsOn: "2026-11-01", endsOn: "2026-11-10" });
    expect(rule("brief_open", past)?.status).toBe("fail");
  });

  it("is unknown when the brief gives no closing date", () => {
    const open = brief({ expiresAt: null });
    expect(rule("brief_open", open)).toMatchObject({ status: "unknown", modelMaySettle: false });
  });
});

describe("adult", () => {
  it("passes for an adult and fails otherwise, without citing a date", () => {
    expect(rule("adult")?.status).toBe("pass");
    const result = evaluateConstraints(brief(), profile({ isAdult: false }), now);
    expect(result.decision).toBe("ineligible");
    expect(result.profileEvidence).toContainEqual({
      field: "profile.isAdult",
      excerpt: null,
      source: "rules",
    });
  });
});

describe("role_type", () => {
  it("passes when the role type is one of the specialties", () => {
    expect(rule("role_type")?.status).toBe("pass");
  });

  it("fails when it is another type", () => {
    expect(rule("role_type", brief({ roleType: "voix" }))).toMatchObject({
      status: "fail",
      fields: ["brief.roleType", "profile.specialties"],
    });
  });

  it("is unknown when the brief names no role type", () => {
    expect(rule("role_type", brief({ roleType: null }))).toMatchObject({
      status: "unknown",
      modelMaySettle: true,
    });
  });

  it("is unknown, for a person, when the profile lists no specialty", () => {
    expect(rule("role_type", brief(), profile({ specialties: [] }))).toMatchObject({
      status: "unknown",
      modelMaySettle: false,
    });
  });
});

describe("location", () => {
  it("passes for remote work, wherever the performer is", () => {
    const remote = brief({ remote: true, country: "JP" });
    expect(rule("location", remote, profile({ mobilityCountries: [] }))).toMatchObject({
      status: "pass",
      fields: ["brief.remote"],
    });
  });

  it("passes when the country is one the profile lists", () => {
    expect(rule("location")?.status).toBe("pass");
  });

  it("fails when the country is not one the profile lists", () => {
    expect(rule("location", brief({ country: "FR" }))).toMatchObject({
      status: "fail",
      fields: ["brief.country", "profile.mobilityCountries"],
    });
  });

  it("is unknown when the profile lists no country", () => {
    expect(rule("location", brief(), profile({ mobilityCountries: [] }))?.status).toBe("unknown");
  });

  it("passes for the same city when no country is given", () => {
    const local = brief({ country: null, location: "new york" });
    expect(rule("location", local)?.status).toBe("pass");
  });

  it("is unknown for a place with no country, and never guesses the geography", () => {
    const place = brief({ country: null, location: "Brooklyn" });
    expect(rule("location", place)).toMatchObject({ status: "unknown", modelMaySettle: false });
  });

  it("is unknown when the brief does not say where the work is", () => {
    expect(rule("location", brief({ country: null }))?.status).toBe("unknown");
    expect(rule("location", brief({ country: null, remote: false }))?.status).toBe("unknown");
  });
});

describe("availability", () => {
  it("passes when a period marked available covers the work", () => {
    expect(rule("availability")?.status).toBe("pass");
  });

  it("passes when adjacent periods cover it together", () => {
    const split = profile({
      availability: [
        { from: "2026-11-25", to: "2026-12-01", type: "AVAILABLE", zones: [] },
        { from: "2026-12-02", to: "2026-12-05", type: "AVAILABLE", zones: [] },
      ],
    });
    expect(rule("availability", brief(), split)?.status).toBe("pass");
  });

  it("uses the start date alone when the brief gives no end date", () => {
    const oneDay = profile({
      availability: [{ from: "2026-12-01", to: "2026-12-01", type: "AVAILABLE", zones: [] }],
    });
    expect(rule("availability", brief({ endsOn: null }), oneDay)?.status).toBe("pass");
  });

  it("fails when the work overlaps a period marked unavailable", () => {
    const busy = profile({
      availability: [
        { from: "2026-11-25", to: "2026-12-10", type: "AVAILABLE", zones: [] },
        { from: "2026-12-03", to: "2026-12-04", type: "UNAVAILABLE", zones: [] },
      ],
    });
    const result = rule("availability", brief(), busy);
    expect(result?.status).toBe("fail");
    expect(result?.excerpts?.["profile.availability"]).toBe("UNAVAILABLE 2026-12-03 to 2026-12-04");
  });

  it("is unknown when the brief gives no start date", () => {
    expect(rule("availability", brief({ startsOn: null, endsOn: null }))?.status).toBe("unknown");
  });

  it("is unknown when nothing is recorded for the dates", () => {
    expect(rule("availability", brief(), profile({ availability: [] }))?.status).toBe("unknown");
  });

  it("is unknown when the available period covers only part of the work", () => {
    const partial = profile({
      availability: [{ from: "2026-12-01", to: "2026-12-02", type: "AVAILABLE", zones: [] }],
    });
    expect(rule("availability", brief(), partial)?.status).toBe("unknown");
    const gap = profile({
      availability: [
        { from: "2026-12-01", to: "2026-12-01", type: "AVAILABLE", zones: [] },
        { from: "2026-12-03", to: "2026-12-03", type: "AVAILABLE", zones: [] },
      ],
    });
    expect(rule("availability", brief(), gap)?.status).toBe("unknown");
  });

  it("counts a period limited to places only where the brief is", () => {
    const elsewhere = profile({
      availability: [{ from: "2026-11-25", to: "2026-12-10", type: "AVAILABLE", zones: ["FR"] }],
    });
    expect(rule("availability", brief(), elsewhere)?.status).toBe("unknown");
    const here = profile({
      availability: [{ from: "2026-11-25", to: "2026-12-10", type: "AVAILABLE", zones: ["us"] }],
    });
    expect(rule("availability", brief(), here)?.status).toBe("pass");
  });

  it("asks instead of failing when an unavailable period is limited to other places", () => {
    const blockedElsewhere = profile({
      availability: [{ from: "2026-12-01", to: "2026-12-05", type: "UNAVAILABLE", zones: ["Paris"] }],
    });
    expect(rule("availability", brief(), blockedElsewhere)?.status).toBe("unknown");
  });
});

describe("explicit preferences", () => {
  it("do not run when the brief asks for nothing", () => {
    expect(rule("nudity")).toBeUndefined();
    expect(rule("animals")).toBeUndefined();
    expect(rule("nudity", brief({ requirements: { nudity: false } }))).toBeUndefined();
  });

  it("pass when the performer accepts, fail when they decline", () => {
    const asks = brief({ requirements: { nudity: true, animals: true } });
    const accepts = profile({ preferences: { nudity: true, animals: true, projectTypes: [], compensation: null } });
    const declines = profile({ preferences: { nudity: false, animals: false, projectTypes: [], compensation: null } });
    expect(rule("nudity", asks, accepts)?.status).toBe("pass");
    expect(rule("animals", asks, accepts)?.status).toBe("pass");
    expect(rule("nudity", asks, declines)).toMatchObject({
      status: "fail",
      fields: ["brief.requirements.nudity", "preferences.nudity"],
    });
    expect(rule("animals", asks, declines)?.status).toBe("fail");
  });

  it("are unknown when the performer never recorded an answer", () => {
    const asks = brief({ requirements: { nudity: true } });
    expect(rule("nudity", asks)).toMatchObject({ status: "unknown", modelMaySettle: false });
  });
});

describe("compensation", () => {
  const prefs = (compensation: "paid_only" | "paid_or_unpaid" | null) =>
    profile({ preferences: { nudity: null, animals: null, projectTypes: [], compensation } });

  it("only runs for a brief that says it is unpaid", () => {
    expect(rule("compensation", brief({ paid: true }), prefs("paid_only"))).toBeUndefined();
    expect(rule("compensation", brief(), prefs("paid_only"))).toBeUndefined();
  });

  it("fails an unpaid brief for a performer who takes paid work only", () => {
    expect(rule("compensation", brief({ paid: false }), prefs("paid_only"))).toMatchObject({
      status: "fail",
      fields: ["brief.paid", "preferences.compensation"],
    });
  });

  it("passes it for a performer open to unpaid work", () => {
    expect(rule("compensation", brief({ paid: false }), prefs("paid_or_unpaid"))?.status).toBe("pass");
  });

  it("asks when the performer never said, and leaves the question to the person", () => {
    expect(rule("compensation", brief({ paid: false }), prefs(null))).toMatchObject({
      status: "unknown",
      modelMaySettle: false,
    });
  });
});

describe("rate", () => {
  const withMinimum = profile({ minRateCents: 20000 });

  it("does not run when the profile sets no minimum", () => {
    expect(rule("rate", brief({ rateCents: 100 }))).toBeUndefined();
  });

  it("passes at or above the minimum", () => {
    expect(rule("rate", brief({ paid: true, rateCents: 20000 }), withMinimum)?.status).toBe("pass");
  });

  it("is unknown, never a failure, below the minimum, unpaid, or with no rate", () => {
    const below = rule("rate", brief({ paid: true, rateCents: 5000 }), withMinimum);
    expect(below).toMatchObject({ status: "unknown", missingField: "Brief.rateUnit, Brief.currency" });
    expect(rule("rate", brief({ paid: false }), withMinimum)?.status).toBe("unknown");
    expect(rule("rate", brief({ paid: true }), withMinimum)?.status).toBe("unknown");
  });
});

describe("languages and skills", () => {
  it("languages pass when all are declared, compared loosely", () => {
    const asks = brief({ requirements: { languages: ["english"] } });
    expect(rule("languages", asks)?.status).toBe("pass");
  });

  it("a language that is not declared is a question, never a failure", () => {
    const asks = brief({ requirements: { languages: ["English", "Spanish"] } });
    const result = rule("languages", asks);
    expect(result).toMatchObject({ status: "unknown", modelMaySettle: true });
    expect(result?.question).toContain("Spanish");
    expect(result?.question).not.toContain("English,");
    expect(rule("languages", asks, profile({ languages: [] }))).toMatchObject({
      status: "unknown",
      modelMaySettle: false,
    });
  });

  it("skills pass only on a recorded tag and are never inferred", () => {
    const asks = brief({ requirements: { skills: ["Stage combat"] } });
    expect(rule("skills", asks)).toMatchObject({ status: "unknown", modelMaySettle: false });
    const tagged = profile({
      specialties: [{ kind: "figuration", level: "CONFIRMED", tags: ["stage combat"] }],
    });
    expect(rule("skills", asks, tagged)?.status).toBe("pass");
  });
});

describe("facts the profile cannot hold", () => {
  it("a union status is a question and names the missing field", () => {
    const result = rule("union_status", brief({ unionStatus: "SAG-AFTRA" }));
    expect(result).toMatchObject({ status: "unknown", missingField: "ArtistProfile.unionStatus" });
    expect(rule("union_status")).toBeUndefined();
  });

  it("a right-to-work requirement is a question and names the missing field", () => {
    const asks = brief({ requirements: { workAuthorization: ["US"] } });
    expect(rule("work_authorization", asks)).toMatchObject({
      status: "unknown",
      missingField: "ArtistProfile.workAuthorization",
    });
  });

  it("lists the missing fields once", () => {
    const rules = runRules(
      brief({ unionStatus: "union", requirements: { workAuthorization: ["US"] } }),
      profile(),
      now
    );
    expect(missingFields(rules)).toEqual([
      "ArtistProfile.unionStatus",
      "ArtistProfile.workAuthorization",
    ]);
  });

  it("other requirements are a question", () => {
    const asks = brief({ requirements: { other: ["Own a tuxedo", "Valid passport"] } });
    const result = rule("other_requirements", asks);
    expect(result?.status).toBe("unknown");
    expect(result?.question).toContain("2 other requirements");
  });
});

describe("protected traits", () => {
  it.each(PROTECTED_REQUIREMENTS)("a requirement about %s is a question for the human", (trait) => {
    const asks = brief({ requirements: { [trait]: "stated in the brief" } });
    const result = evaluateConstraints(asks, profile(), now);
    expect(result.decision).toBe("needs_review");
    const unknown = result.unknowns.find((item) => item.rule === `protected:${trait}`);
    expect(unknown?.fields).toEqual([`brief.requirements.${trait}`]);
    expect(unknown?.question).toMatch(/Agental does not assess it/);
    const outcome = result.rules.find((item) => item.rule === `protected:${trait}`);
    expect(outcome?.modelMaySettle).toBe(false);
    // The rule read the brief and nothing of the performer.
    expect(outcome?.fields.some((field) => !field.startsWith("brief."))).toBe(false);
  });

  it("never turns a protected requirement into a failure or a pass", () => {
    const asks = brief({
      requirements: { gender: "x", ethnicity: "y", playingAge: "20-25", appearance: "tall" },
    });
    const statuses = runRules(asks, profile(), now)
      .filter((item) => item.rule.startsWith("protected:"))
      .map((item) => item.status);
    expect(statuses).toEqual(["unknown", "unknown", "unknown", "unknown"]);
  });
});

describe("toProfileFacts", () => {
  const record = {
    id: "p1",
    birthDate: new Date("1990-05-01T00:00:00Z"),
    isMinor: false,
    city: "  New York ",
    physical: JSON.stringify({
      heightCm: 180,
      hair: "brown",
      eyes: "green",
      build: "slim",
      languages: ["English", "French"],
      accents: ["Southern"],
    }),
    // As the old form stored it: its "no" for nudity was only the default.
    preferences: JSON.stringify({ nudity: false, animals: true, projectTypes: ["film"], autoApply: true }),
    mobilityCountries: JSON.stringify(["us", "CA"]),
    minRateCents: 0,
    specialties: [{ kind: "figuration", level: "CONFIRMED", tags: '["horse riding"]' }],
    availability: [
      { from: new Date("2026-12-01T00:00:00Z"), to: new Date("2026-12-05T00:00:00Z"), type: "AVAILABLE", zones: "[]" },
      { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-05T00:00:00Z"), type: "AVAILABLE", zones: "[]" },
      { from: new Date("2026-12-20T00:00:00Z"), to: new Date("2026-12-22T00:00:00Z"), type: "UNAVAILABLE", zones: '["Paris"]' },
    ],
  };

  it("keeps the permissioned fields and nothing about appearance, voice or birth date", () => {
    const facts = toProfileFacts(record, now);
    expect(facts).toEqual({
      profileId: "p1",
      isAdult: true,
      city: "New York",
      mobilityCountries: ["US", "CA"],
      specialties: [{ kind: "figuration", level: "CONFIRMED", tags: ["horse riding"] }],
      languages: ["English", "French"],
      minRateCents: null,
      preferences: { nudity: null, animals: true, projectTypes: ["film"], compensation: null },
      availability: [
        { from: "2026-12-01", to: "2026-12-05", type: "AVAILABLE", zones: [] },
        { from: "2026-12-20", to: "2026-12-22", type: "UNAVAILABLE", zones: ["Paris"] },
      ],
    });
    const text = JSON.stringify(facts);
    for (const hidden of ["180", "brown", "green", "slim", "Southern", "1990"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("reads the current preferences format, with the content boundary under its own key", () => {
    const facts = toProfileFacts(
      {
        ...record,
        preferences: JSON.stringify({
          v: 2,
          animals: false,
          compensation: "paid_only",
          projectTypes: ["film", "not offered any more"],
          contentBoundaries: { nudity: false },
        }),
      },
      now
    );
    expect(facts.preferences).toEqual({
      nudity: false,
      animals: false,
      projectTypes: ["film"],
      compensation: "paid_only",
    });
  });

  it("leaves an unrecorded preference as null", () => {
    const facts = toProfileFacts({ ...record, preferences: "{}" }, now);
    expect(facts.preferences).toEqual({ nudity: null, animals: null, projectTypes: [], compensation: null });
  });

  it("refuses the 18+ gate to a minor, a flagged profile or a missing birth date", () => {
    expect(toProfileFacts({ ...record, birthDate: new Date("2010-01-01T00:00:00Z") }, now).isAdult).toBe(false);
    expect(toProfileFacts({ ...record, isMinor: true }, now).isAdult).toBe(false);
    expect(toProfileFacts({ ...record, birthDate: null }, now).isAdult).toBe(false);
  });

  it("survives unreadable JSON columns", () => {
    const facts = toProfileFacts(
      { ...record, physical: "{", preferences: "[]", mobilityCountries: "nope" },
      now
    );
    expect(facts.languages).toEqual([]);
    expect(facts.mobilityCountries).toEqual([]);
    expect(facts.preferences.nudity).toBeNull();
  });
});
