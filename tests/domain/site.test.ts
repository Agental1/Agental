import { describe, expect, it } from "vitest";
import talents from "../../messages/en/talents.json";
import {
  MAX_SITES_PER_USER,
  RESERVED_SUBDOMAINS,
  SITE_TEMPLATES,
  SiteContent,
  SiteInput,
  parseSiteContent,
  slugifySubdomain,
  subdomainCandidate,
} from "@/domain/site";

/**
 * What a performer may put on a Limelight site, and the address it gets.
 * These rules guard a public page: a link that is not https, a name that
 * turns into "admin", or a field with no upper bound would all ship without
 * a type error.
 */

const minimal = { name: "Ana Lee" };

describe("SITE_TEMPLATES", () => {
  it("has one id per template shown on the Limelight page, in the same order", () => {
    // Nothing in the code ties the page's template names to these ids. A
    // template added to the message files only would be shown and could not
    // be chosen.
    const shown = talents.limelight.templates.items.map((item) =>
      item.name.toLowerCase().replace(/\s+/g, "-")
    );
    expect([...SITE_TEMPLATES]).toEqual(shown);
  });

  it("allows three sites per user", () => {
    expect(MAX_SITES_PER_USER).toBe(3);
  });
});

describe("SiteContent", () => {
  it("accepts a name alone and fills the rest with empty values", () => {
    expect(SiteContent.parse(minimal)).toEqual({
      name: "Ana Lee",
      headline: "",
      bio: "",
      links: [],
      credits: [],
      mediaIds: [],
    });
  });

  it("trims strings and drops unknown keys", () => {
    const parsed = SiteContent.parse({
      name: "  Ana Lee ",
      headline: " Actor, Los Angeles  ",
      bio: "\n Bilingual. \n",
      links: [{ label: " IMDb ", url: " https://www.imdb.com/name/nm0000001/ ", rel: "me" }],
      credits: [{ title: " The Long Night ", role: " Lead ", year: 2024, award: "x" }],
      contactEmail: " ana@example.com ",
      isAdmin: true,
      script: "<script>",
    });
    expect(parsed).toEqual({
      name: "Ana Lee",
      headline: "Actor, Los Angeles",
      bio: "Bilingual.",
      links: [{ label: "IMDb", url: "https://www.imdb.com/name/nm0000001/" }],
      credits: [{ title: "The Long Night", role: "Lead", year: 2024 }],
      contactEmail: "ana@example.com",
      mediaIds: [],
    });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a name over 80 characters", { name: "a".repeat(81) }],
    ["a headline over 140 characters", { ...minimal, headline: "h".repeat(141) }],
    ["a bio over 2000 characters", { ...minimal, bio: "b".repeat(2001) }],
    [
      "more than 8 links",
      { ...minimal, links: Array.from({ length: 9 }, () => ({ label: "x", url: "https://example.com" })) },
    ],
    ["a link label over 40 characters", { ...minimal, links: [{ label: "l".repeat(41), url: "https://example.com" }] }],
    [
      "more than 30 credits",
      { ...minimal, credits: Array.from({ length: 31 }, () => ({ title: "t", role: "r" })) },
    ],
    ["a credit title over 120 characters", { ...minimal, credits: [{ title: "t".repeat(121), role: "r" }] }],
    ["a credit role over 80 characters", { ...minimal, credits: [{ title: "t", role: "r".repeat(81) }] }],
    ["a credit year before 1900", { ...minimal, credits: [{ title: "t", role: "r", year: 1899 }] }],
    ["a credit year after 2100", { ...minimal, credits: [{ title: "t", role: "r", year: 2101 }] }],
    ["a credit year that is not a whole number", { ...minimal, credits: [{ title: "t", role: "r", year: 2020.5 }] }],
    ["a contact email that is not one", { ...minimal, contactEmail: "ana at example" }],
    ["more than 12 media", { ...minimal, mediaIds: Array.from({ length: 13 }, (_, i) => `m${i}`) }],
    ["a media id that is not a string", { ...minimal, mediaIds: [42] }],
  ])("refuses %s", (_label, input) => {
    expect(SiteContent.safeParse(input).success).toBe(false);
  });

  it("accepts every field at its limit", () => {
    const parsed = SiteContent.safeParse({
      name: "a".repeat(80),
      headline: "h".repeat(140),
      bio: "b".repeat(2000),
      links: Array.from({ length: 8 }, () => ({ label: "l".repeat(40), url: "https://example.com" })),
      credits: Array.from({ length: 30 }, () => ({ title: "t".repeat(120), role: "r".repeat(80), year: 1900 })),
      mediaIds: Array.from({ length: 12 }, (_, i) => `m${i}`),
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,hello",
    "//example.com/path",
    "example.com",
    "https://",
    "https://localhost",
    "https://imdb.com@elsewhere.example/",
    "https://user:secret@example.com/",
    `https://example.com/${"p".repeat(500)}`,
  ])("refuses the link %s", (url) => {
    expect(SiteContent.safeParse({ ...minimal, links: [{ label: "x", url }] }).success).toBe(false);
  });

  it.each([
    "https://www.imdb.com/name/nm0000001/",
    "https://instagram.com/ana.lee",
    "https://vimeo.com/123456?share=copy#t=10",
    "HTTPS://Example.com/Reel",
  ])("accepts the link %s", (url) => {
    expect(SiteContent.safeParse({ ...minimal, links: [{ label: "x", url }] }).success).toBe(true);
  });

  it("reads an empty year or contact email as absent", () => {
    // What a form sends for a field left blank.
    const parsed = SiteContent.parse({
      ...minimal,
      contactEmail: "",
      credits: [
        { title: "t", role: "r", year: "" },
        { title: "t", role: "r", year: null },
        { title: "t", role: "r" },
      ],
    });
    expect(parsed.contactEmail).toBeUndefined();
    expect(parsed.credits.map((c) => c.year)).toEqual([undefined, undefined, undefined]);
  });
});

describe("SiteInput", () => {
  it("accepts a known template, with or without a site id", () => {
    expect(SiteInput.safeParse({ template: "marquee", content: minimal }).success).toBe(true);
    expect(
      SiteInput.parse({ siteId: " s1 ", template: "voice-booth", content: minimal }).siteId
    ).toBe("s1");
  });

  it.each([
    ["an unknown template", { template: "Marquee", content: minimal }],
    ["no template", { content: minimal }],
    ["no content", { template: "studio" }],
    ["an empty site id", { siteId: "", template: "studio", content: minimal }],
    ["invalid content", { template: "studio", content: { name: "" } }],
  ])("refuses %s", (_label, input) => {
    expect(SiteInput.safeParse(input).success).toBe(false);
  });

  it("drops keys it does not know, such as an owner", () => {
    const parsed = SiteInput.parse({
      template: "studio",
      content: minimal,
      userId: "someone-else",
      status: "PUBLISHED",
      subdomain: "admin",
    });
    expect(Object.keys(parsed).sort()).toEqual(["content", "template"]);
  });
});

describe("parseSiteContent", () => {
  it("reads back what was stored", () => {
    const stored = JSON.stringify(SiteContent.parse({ ...minimal, mediaIds: ["m1"] }));
    expect(parseSiteContent(stored)).toMatchObject({ name: "Ana Lee", mediaIds: ["m1"] });
  });

  it.each([["not json", "{name"], ["a row with no name", "{}"], ["null", null]])(
    "answers null for %s",
    (_label, raw) => {
      expect(parseSiteContent(raw)).toBeNull();
    }
  );
});

describe("slugifySubdomain", () => {
  it.each([
    ["Ana Lee", "ana-lee"],
    ["  Maya   Okafor  ", "maya-okafor"],
    ["Chloé Müller", "chloe-muller"],
    ["Zoë O'Brien-Smith", "zoe-o-brien-smith"],
    ["JOSÉ ÁNGEL NÚÑEZ", "jose-angel-nunez"],
    ["Søren Straße", "soren-strasse"],
    ["Łukasz Æther", "lukasz-aether"],
    ["Dr. Ana Lee, Jr.", "dr-ana-lee-jr"],
    ["ana_lee.actor", "ana-lee-actor"],
    ["--Ana--Lee--", "ana-lee"],
    ["Agent 007", "agent-007"],
    ["李娜 Li Na", "li-na"],
  ])("turns %j into %j", (name, slug) => {
    expect(slugifySubdomain(name)).toBe(slug);
  });

  it.each([
    ["nothing", ""],
    ["only spaces and punctuation", " .,;!? "],
    ["a non-Latin script", "李娜"],
    ["two letters", "Al"],
    ["two letters once cleaned", " -Él!- "],
  ])("answers null for %s", (_label, name) => {
    expect(slugifySubdomain(name)).toBeNull();
  });

  it.each(["www", "app", "api", "admin", "mail", "agental", "limelight", "staging", "dev", "test"])(
    "refuses the reserved name %s",
    (name) => {
      expect(RESERVED_SUBDOMAINS.has(name)).toBe(true);
      expect(slugifySubdomain(name)).toBeNull();
      expect(slugifySubdomain(name.toUpperCase())).toBeNull();
      expect(slugifySubdomain(` ${name}! `)).toBeNull();
    }
  );

  it("lets a reserved word be part of a longer name", () => {
    expect(slugifySubdomain("Admin Jones")).toBe("admin-jones");
    expect(slugifySubdomain("Dev Patel")).toBe("dev-patel");
  });

  it("cuts at 40 characters without leaving a hyphen at the end", () => {
    const slug = slugifySubdomain(`${"a".repeat(39)} ${"b".repeat(20)}`);
    expect(slug).toBe("a".repeat(39));
    expect(slugifySubdomain("x".repeat(80))).toHaveLength(40);
  });

  it("only ever produces a valid DNS label", () => {
    const names = ["Ana Lee", "Chloé Müller", "x".repeat(80), "a - b - c", "Ünïcødé Ñame 2", "A.B.C.D"];
    for (const name of names) {
      expect(slugifySubdomain(name)).toMatch(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/);
    }
  });
});

describe("subdomainCandidate", () => {
  it("is the base first, then numbered from 2", () => {
    expect(subdomainCandidate("ana-lee", 1)).toBe("ana-lee");
    expect(subdomainCandidate("ana-lee", 2)).toBe("ana-lee-2");
    expect(subdomainCandidate("ana-lee", 13)).toBe("ana-lee-13");
  });

  it("shortens the base so the number still fits in 40 characters", () => {
    const base = "a".repeat(40);
    expect(subdomainCandidate(base, 2)).toBe(`${"a".repeat(38)}-2`);
    expect(subdomainCandidate(base, 25)).toHaveLength(40);
    // No double hyphen when the cut lands on one.
    expect(subdomainCandidate(`${"a".repeat(37)}-bc`, 2)).toBe(`${"a".repeat(37)}-2`);
  });
});
