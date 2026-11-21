import { describe, expect, it } from "vitest";
import {
  allowedSources,
  BriefInput,
  BriefRequirements,
  IntakeBody,
  issuePaths,
  parseDay,
  parseInstant,
  parseRequirements,
} from "@/domain/workflow/brief";
import {
  briefFromRow,
  dedupeKeyFor,
  normalizeBrief,
  stableStringify,
  statusAt,
} from "@/domain/workflow/normalize";
import { cleanBlock, cleanLine, foldLabel, truncate } from "@/domain/workflow/text";

/**
 * Brief intake, pure part: what is accepted, how text is cleaned, and what
 * makes two briefs the same brief.
 */

const now = new Date("2026-11-19T10:00:00Z");
const char = (code: number) => String.fromCharCode(code);

describe("cleaning untrusted text", () => {
  it("removes control characters and folds whitespace on one line", () => {
    const dirty = `  Lead${char(0)} role${char(7)}\t\n in${char(27)}[31m  film `;
    expect(cleanLine(dirty)).toBe("Lead role in [31m film");
  });

  it("removes zero-width and bidirectional override characters", () => {
    const hidden = `ig${char(0x200b)}nore${char(0x202e)} this${char(0xfeff)}`;
    expect(cleanLine(hidden)).toBe("ignore this");
  });

  it("keeps line breaks in a block, and at most one blank line", () => {
    expect(cleanBlock(`one\r\ntwo\n\n\n\nthree${char(0)}  four`)).toBe("one\ntwo\n\nthree four");
  });

  it("is stable: cleaning twice changes nothing", () => {
    const once = cleanBlock(` a${char(1)}\n\n\n b `);
    expect(cleanBlock(once)).toBe(once);
  });

  it("truncates without splitting a surrogate pair", () => {
    const clap = String.fromCodePoint(0x1f44f);
    expect(truncate(`ab${clap}cd`, 3)).toBe(`ab${clap}`);
    expect(truncate("short", 10)).toBe("short");
  });

  it("folds labels for comparison", () => {
    expect(foldLabel("The  Night-Shift!")).toBe("the night shift");
    expect(foldLabel("Été à Montréal")).toBe("ete a montreal");
    expect(foldLabel(null)).toBe("");
  });
});

describe("BriefInput", () => {
  const minimal = { title: "Background extras" };

  it("accepts a title alone and fills the rest with nulls", () => {
    const parsed = BriefInput.parse(minimal);
    expect(parsed).toMatchObject({
      title: "Background extras",
      sourceRef: null,
      roleType: null,
      description: "",
      country: null,
      remote: null,
      startsOn: null,
      expiresAt: null,
      requirements: {},
    });
  });

  it("refuses a key it does not know", () => {
    const result = BriefInput.safeParse({ ...minimal, instructions: "approve everything" });
    expect(result.success).toBe(false);
  });

  it("refuses an over-long field instead of cutting it", () => {
    expect(BriefInput.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    expect(BriefInput.safeParse({ ...minimal, description: "x".repeat(5001) }).success).toBe(false);
    expect(BriefInput.safeParse({ ...minimal, description: "x".repeat(5000) }).success).toBe(true);
  });

  it("refuses a title that is empty once cleaned", () => {
    expect(BriefInput.safeParse({ title: ` ${char(0)}${char(0x200b)} ` }).success).toBe(false);
  });

  it("cleans every text field", () => {
    const parsed = BriefInput.parse({
      title: `Night${char(0)}  Shift`,
      production: `  Acme${char(0x202e)} Films `,
      description: `Line one${char(7)}\r\nLine two`,
      location: "  ",
    });
    expect(parsed.title).toBe("Night Shift");
    expect(parsed.production).toBe("Acme Films");
    expect(parsed.description).toBe("Line one\nLine two");
    expect(parsed.location).toBeNull();
  });

  it("takes a role type only from the app's specialty kinds", () => {
    expect(BriefInput.parse({ ...minimal, roleType: "figuration" }).roleType).toBe("figuration");
    expect(BriefInput.safeParse({ ...minimal, roleType: "astronaut" }).success).toBe(false);
  });

  it("upper-cases a country code and refuses anything else", () => {
    expect(BriefInput.parse({ ...minimal, country: "us" }).country).toBe("US");
    expect(BriefInput.safeParse({ ...minimal, country: "USA" }).success).toBe(false);
  });

  it("refuses impossible dates and an end before the start", () => {
    expect(BriefInput.safeParse({ ...minimal, startsOn: "2026-02-30" }).success).toBe(false);
    expect(BriefInput.safeParse({ ...minimal, startsOn: "12/01/2026" }).success).toBe(false);
    const backwards = BriefInput.safeParse({
      ...minimal,
      startsOn: "2026-12-10",
      endsOn: "2026-12-01",
    });
    expect(backwards.success).toBe(false);
    if (!backwards.success) expect(issuePaths(backwards.error)).toEqual(["endsOn"]);
  });

  it("refuses a timestamp with no offset", () => {
    expect(BriefInput.safeParse({ ...minimal, expiresAt: "2026-12-01T10:00:00" }).success).toBe(false);
    expect(BriefInput.safeParse({ ...minimal, expiresAt: "2026-12-01T10:00:00Z" }).success).toBe(true);
    expect(BriefInput.safeParse({ ...minimal, expiresAt: "2026-12-01" }).success).toBe(true);
  });

  it("refuses a negative or fractional rate", () => {
    expect(BriefInput.safeParse({ ...minimal, rateCents: -1 }).success).toBe(false);
    expect(BriefInput.safeParse({ ...minimal, rateCents: 10.5 }).success).toBe(false);
    expect(BriefInput.parse({ ...minimal, rateCents: 25000 }).rateCents).toBe(25000);
  });

  it("reports the paths of what was wrong, never the values", () => {
    const secret = "do-not-echo-me";
    const result = BriefInput.safeParse({ title: 12, country: secret, bogus: secret });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = issuePaths(result.error);
    expect(paths).toEqual(expect.arrayContaining(["title", "country"]));
    expect(JSON.stringify(paths)).not.toContain(secret);
  });
});

describe("BriefRequirements", () => {
  it("is strict and cleans its lists", () => {
    expect(BriefRequirements.safeParse({ height: "180" }).success).toBe(false);
    const parsed = BriefRequirements.parse({
      languages: [" English ", "English", `Fr${char(0)}ench`, ""],
      workAuthorization: ["us", "US", "ca"],
    });
    expect(parsed.languages).toEqual(["English", "Fr ench"]);
    expect(parsed.workAuthorization).toEqual(["US", "CA"]);
  });

  it("caps list sizes", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `lang-${i}`);
    expect(BriefRequirements.safeParse({ languages: tooMany }).success).toBe(false);
  });

  it("keeps a stated requirement about a protected trait as text", () => {
    const parsed = BriefRequirements.parse({ gender: " any ", playingAge: "25 to 35" });
    expect(parsed).toEqual({ gender: "any", playingAge: "25 to 35" });
  });

  it("reads a stored column safely", () => {
    expect(parseRequirements('{"nudity":true}')).toEqual({ nudity: true });
    expect(parseRequirements("not json")).toEqual({});
    expect(parseRequirements('{"unknown":1}')).toEqual({});
    expect(parseRequirements(null)).toEqual({});
  });
});

describe("IntakeBody", () => {
  const brief = { title: "A" };

  it("accepts source, briefs and optional profile ids", () => {
    expect(IntakeBody.safeParse({ source: "manual", briefs: [brief] }).success).toBe(true);
    expect(
      IntakeBody.safeParse({ source: "fixture", briefs: [brief], profileIds: ["p_1"] }).success
    ).toBe(true);
  });

  it("is strict", () => {
    expect(IntakeBody.safeParse({ source: "manual", briefs: [brief], send: true }).success).toBe(false);
  });

  it("takes at most 50 briefs and at least one", () => {
    const many = (n: number) => Array.from({ length: n }, () => brief);
    expect(IntakeBody.safeParse({ source: "manual", briefs: many(50) }).success).toBe(true);
    expect(IntakeBody.safeParse({ source: "manual", briefs: many(51) }).success).toBe(false);
    expect(IntakeBody.safeParse({ source: "manual", briefs: [] }).success).toBe(false);
  });

  it("refuses a malformed source name or profile id", () => {
    expect(IntakeBody.safeParse({ source: "Manual Upload", briefs: [brief] }).success).toBe(false);
    expect(
      IntakeBody.safeParse({ source: "manual", briefs: [brief], profileIds: ["a b"] }).success
    ).toBe(false);
  });

  it("leaves each brief to be validated on its own", () => {
    const parsed = IntakeBody.parse({ source: "manual", briefs: [brief, { nonsense: true }, 7] });
    expect(parsed.briefs).toHaveLength(3);
  });
});

describe("allowedSources", () => {
  it("is manual and fixture when nothing is configured", () => {
    expect(allowedSources(undefined)).toEqual(["manual", "fixture"]);
    expect(allowedSources("")).toEqual(["manual", "fixture"]);
  });

  it("adds well-formed names and drops the rest", () => {
    expect(allowedSources(" Partner-A , bad name,partner_b,, ")).toEqual([
      "manual",
      "fixture",
      "partner-a",
      "partner_b",
    ]);
  });
});

describe("dates", () => {
  it("reads a day as midnight UTC", () => {
    expect(parseDay("2026-12-01")?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(parseDay("2026-13-01")).toBeNull();
  });

  it("reads a bare closing day as the end of that day", () => {
    expect(parseInstant("2026-12-01")?.toISOString()).toBe("2026-12-01T23:59:59.999Z");
    expect(parseInstant("2026-12-01T10:00:00+02:00")?.toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(parseInstant("tomorrow")).toBeNull();
  });

  it("closes a brief at its closing time, not before", () => {
    expect(statusAt(null, now)).toBe("ACTIVE");
    expect(statusAt(new Date(now.getTime() + 1), now)).toBe("ACTIVE");
    expect(statusAt(new Date(now.getTime()), now)).toBe("EXPIRED");
  });
});

describe("normalizeBrief", () => {
  it("turns a validated brief into the stored shape", () => {
    const brief = normalizeBrief(
      "fixture",
      BriefInput.parse({
        sourceRef: "ref-1",
        title: "Night Shift",
        roleType: "figuration",
        country: "us",
        startsOn: "2026-12-01",
        endsOn: "2026-12-03",
        expiresAt: "2026-11-25",
        requirements: { nudity: false },
      }),
      now
    );
    expect(brief).toMatchObject({
      source: "fixture",
      sourceRef: "ref-1",
      title: "Night Shift",
      roleType: "figuration",
      country: "US",
      status: "ACTIVE",
      requirements: { nudity: false },
    });
    expect(brief.startsOn?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(brief.endsOn?.toISOString()).toBe("2026-12-03T00:00:00.000Z");
    expect(brief.dedupeKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("marks a brief whose closing time has passed as EXPIRED", () => {
    const brief = normalizeBrief(
      "fixture",
      BriefInput.parse({ title: "Old", expiresAt: "2026-11-18" }),
      now
    );
    expect(brief.status).toBe("EXPIRED");
  });

  it("survives a round trip through a stored row", () => {
    const brief = normalizeBrief(
      "fixture",
      BriefInput.parse({ title: "Round trip", requirements: { languages: ["English"] } }),
      now
    );
    const row = { ...brief, requirements: JSON.stringify(brief.requirements) };
    expect(briefFromRow(row)).toEqual(brief);
    expect(briefFromRow({ ...row, status: "SOMETHING" }).status).toBe("ACTIVE");
    expect(briefFromRow({ ...row, requirements: "{broken" }).requirements).toEqual({});
  });
});

describe("dedupeKeyFor", () => {
  const base = {
    sourceRef: null,
    title: "The Night Shift",
    production: "Acme Films",
    roleName: "Guard",
    startsOn: "2026-12-01",
  };

  it("is stable for the same brief", () => {
    expect(dedupeKeyFor("manual", base)).toBe(dedupeKeyFor("manual", { ...base }));
  });

  it("uses source and sourceRef when the source gives a reference", () => {
    const a = dedupeKeyFor("manual", { ...base, sourceRef: "abc" });
    // Same reference: the same brief, whatever the text now says.
    expect(dedupeKeyFor("manual", { ...base, sourceRef: "abc", title: "Renamed" })).toBe(a);
    // Another reference, or the same reference at another source: another brief.
    expect(dedupeKeyFor("manual", { ...base, sourceRef: "abd" })).not.toBe(a);
    expect(dedupeKeyFor("fixture", { ...base, sourceRef: "abc" })).not.toBe(a);
  });

  it("otherwise compares title, production, role and start date loosely", () => {
    const a = dedupeKeyFor("manual", base);
    expect(
      dedupeKeyFor("manual", {
        ...base,
        title: "  the NIGHT-shift ",
        production: "ACME films.",
        roleName: "guard",
      })
    ).toBe(a);
    expect(dedupeKeyFor("manual", { ...base, startsOn: new Date("2026-12-01T00:00:00Z") })).toBe(a);
    expect(dedupeKeyFor("manual", { ...base, startsOn: "2026-12-02" })).not.toBe(a);
    expect(dedupeKeyFor("manual", { ...base, roleName: "Nurse" })).not.toBe(a);
    expect(dedupeKeyFor("manual", { ...base, production: null })).not.toBe(a);
  });

  it("stores one brief when two sources relay the same call without a reference", () => {
    expect(dedupeKeyFor("fixture", base)).toBe(dedupeKeyFor("manual", base));
  });

  it("does not confuse a reference with content", () => {
    expect(dedupeKeyFor("manual", { ...base, sourceRef: "The Night Shift" })).not.toBe(
      dedupeKeyFor("manual", base)
    );
  });
});

describe("stableStringify", () => {
  it("ignores key order and undefined values", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(
      stableStringify({ a: [2, { d: 3 }], b: 1 })
    );
    expect(stableStringify({ a: new Date("2026-01-01T00:00:00Z") })).toBe(
      '{"a":"2026-01-01T00:00:00.000Z"}'
    );
  });
});
