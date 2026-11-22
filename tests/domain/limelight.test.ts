import { describe, expect, it } from "vitest";
import {
  LIMELIGHT,
  LIMELIGHT_DEFAULT_CONSENT_VERSION,
  LIMELIGHT_DISCIPLINES,
  LIMELIGHT_NEEDS,
  LIMELIGHT_REFERENCE_PATTERN,
  LimelightLeadInput,
  LimelightLeadStatus,
  cleanPhone,
  parseLimelightInterest,
} from "@/domain/limelight";

/**
 * "Request a portfolio site": what the server accepts from a stranger.
 * The rules here are a contract with the page (which error key lands on
 * which field) and a guard on what reaches the database and the owner's
 * spreadsheet.
 */

const valid = {
  name: "Ana Lee",
  email: "ana@example.com",
  consentVersion: "request-2026-11",
  source: "limelight-page",
};

function errorsOf(input: unknown) {
  const parsed = parseLimelightInterest(input);
  return parsed.ok ? null : parsed.fieldErrors;
}

function dataOf(input: unknown) {
  const parsed = parseLimelightInterest(input);
  if (!parsed.ok) throw new Error(`expected a valid request: ${JSON.stringify(parsed.fieldErrors)}`);
  return parsed.data;
}

describe("LIMELIGHT", () => {
  it("keeps payments off: the beta is by request", () => {
    expect(LIMELIGHT.paymentsEnabled).toBe(false);
  });

  it("has a default consent version that fits the column rule", () => {
    expect(LIMELIGHT_DEFAULT_CONSENT_VERSION.length).toBeGreaterThan(0);
    expect(LIMELIGHT_DEFAULT_CONSENT_VERSION.length).toBeLessThanOrEqual(40);
  });

  it("knows the three lead statuses", () => {
    expect(LimelightLeadStatus.options).toEqual(["NEW", "CONTACTED", "CLOSED"]);
  });
});

describe("parseLimelightInterest", () => {
  it("accepts the four required fields and fills the defaults", () => {
    expect(dataOf(valid)).toEqual({
      name: "Ana Lee",
      email: "ana@example.com",
      consentVersion: "request-2026-11",
      source: "limelight-page",
      marketingOptIn: false,
      locale: "en",
      contactPref: "email",
    });
  });

  it("trims and lowercases the email, and tidies the name", () => {
    const data = dataOf({ ...valid, name: "  Ana\t  Lee \n", email: "  Ana.Lee@Example.COM " });
    expect(data.name).toBe("Ana Lee");
    expect(data.email).toBe("ana.lee@example.com");
  });

  it("ignores unknown fields, the honeypot included", () => {
    const data = dataOf({ ...valid, isAdmin: true, status: "CLOSED", reference: "LL-AAAAAAAA", company: "" });
    expect(Object.keys(data).sort()).toEqual(
      ["consentVersion", "contactPref", "email", "locale", "marketingOptIn", "name", "source"]
    );
  });

  it.each([
    ["no name", { ...valid, name: undefined }, "errors.nameRequired"],
    ["a blank name", { ...valid, name: "   " }, "errors.nameRequired"],
    ["a name that is not text", { ...valid, name: 42 }, "errors.nameRequired"],
    ["a name over 120 characters", { ...valid, name: "a".repeat(121) }, "errors.invalidInput"],
  ])("reports %s on the name field", (_label, input, key) => {
    expect(errorsOf(input)).toEqual({ name: key });
  });

  it("accepts a name of exactly 120 characters", () => {
    expect(dataOf({ ...valid, name: "a".repeat(120) }).name).toHaveLength(120);
  });

  it.each([
    ["no email", undefined],
    ["something that is not an address", "ana at example"],
    ["two addresses", "ana@example.com, bo@example.com"],
    ["an address over 254 characters", `${"a".repeat(250)}@example.com`],
    ["a number", 7],
  ])("reports %s as errors.emailInvalid", (_label, email) => {
    expect(errorsOf({ ...valid, email })).toEqual({ email: "errors.emailInvalid" });
  });

  it.each(LIMELIGHT_DISCIPLINES)("accepts the performer type %s", (performerType) => {
    expect(dataOf({ ...valid, performerType }).performerType).toBe(performerType);
  });

  it("reads an empty performer type as absent and refuses an unknown one", () => {
    expect(dataOf({ ...valid, performerType: "" }).performerType).toBeUndefined();
    expect(dataOf({ ...valid, performerType: null }).performerType).toBeUndefined();
    expect(errorsOf({ ...valid, performerType: "astronaut" })).toEqual({
      performerType: "errors.invalidInput",
    });
  });

  it.each([
    "https://www.imdb.com/name/nm0000001/",
    "http://ana-lee.example.com",
    "HTTPS://Example.com/Reel?x=1#top",
  ])("accepts the portfolio address %s", (portfolioUrl) => {
    expect(dataOf({ ...valid, portfolioUrl }).portfolioUrl).toBe(portfolioUrl);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://example.com/reel",
    "mailto:ana@example.com",
    "example.com",
    "//example.com",
    "https://localhost/reel",
    "https://user:secret@example.com/",
    "https:\\\\example.com",
    `https://example.com/${"p".repeat(300)}`,
    42,
  ])("reports the portfolio address %s as errors.urlInvalid", (portfolioUrl) => {
    expect(errorsOf({ ...valid, portfolioUrl })).toEqual({ portfolioUrl: "errors.urlInvalid" });
  });

  it("reads an empty portfolio address as absent", () => {
    expect(dataOf({ ...valid, portfolioUrl: "  " }).portfolioUrl).toBeUndefined();
    expect(dataOf({ ...valid, portfolioUrl: null }).portfolioUrl).toBeUndefined();
  });

  it("takes the marketing opt-in only as a real boolean", () => {
    expect(dataOf({ ...valid, marketingOptIn: true }).marketingOptIn).toBe(true);
    expect(dataOf({ ...valid, marketingOptIn: false }).marketingOptIn).toBe(false);
    expect(dataOf({ ...valid, marketingOptIn: null }).marketingOptIn).toBe(false);
    expect(errorsOf({ ...valid, marketingOptIn: "yes" })).toEqual({
      marketingOptIn: "errors.invalidInput",
    });
  });

  it.each([
    ["missing", undefined, "errors.consentRequired"],
    ["empty", " ", "errors.consentRequired"],
    ["not text", true, "errors.consentRequired"],
    ["over 40 characters", "v".repeat(41), "errors.invalidInput"],
  ])("reports a consent version that is %s", (_label, consentVersion, key) => {
    expect(errorsOf({ ...valid, consentVersion })).toEqual({ consentVersion: key });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["over 60 characters", "s".repeat(61)],
  ])("reports a source that is %s as errors.invalidInput", (_label, source) => {
    expect(errorsOf({ ...valid, source })).toEqual({ source: "errors.invalidInput" });
  });

  it.each([
    ["fr", "fr"],
    ["ES", "es"],
    ["zh", "zh"],
    ["fr-FR", "fr"],
    ["en_US", "en"],
    ["de", "en"],
    ["", "en"],
    [undefined, "en"],
    [12, "en"],
  ])("reads the locale %j as %j, and never refuses a request over it", (locale, expected) => {
    expect(dataOf({ ...valid, locale }).locale).toBe(expected);
  });

  it("reports every wrong field in one pass", () => {
    expect(
      errorsOf({ name: "", email: "nope", portfolioUrl: "javascript:1", contactPref: "call" })
    ).toEqual({
      name: "errors.nameRequired",
      email: "errors.emailInvalid",
      portfolioUrl: "errors.urlInvalid",
      consentVersion: "errors.consentRequired",
      source: "errors.invalidInput",
      phone: "errors.phoneRequired",
    });
  });

  it.each([null, undefined, "text", 3, []])("refuses a body that is %j", (body) => {
    expect(parseLimelightInterest(body).ok).toBe(false);
  });
});

describe("what they need, and how to reach them", () => {
  it("takes what they need as free text, in their own words", () => {
    const need = "A one-page site with my reel and headshots before pilot season. Budget is tight!";
    expect(dataOf({ ...valid, need }).need).toBe(need);
    expect(dataOf({ ...valid, need: "Un site pour ma bande démo, 李娜" }).need).toBe(
      "Un site pour ma bande démo, 李娜"
    );
  });

  it.each(LIMELIGHT_NEEDS)("still accepts the fixed choice %s of the form on the page today", (need) => {
    expect(dataOf({ ...valid, need }).need).toBe(need);
  });

  it("puts the need on one line: breaks and control characters become spaces", () => {
    expect(dataOf({ ...valid, need: "  A new site.\r\n\r\nWith a reel\tand photos. " }).need).toBe(
      "A new site. With a reel and photos."
    );
  });

  it("reads an empty need as absent, and caps it at 500 characters", () => {
    expect(dataOf({ ...valid, need: "" }).need).toBeUndefined();
    expect(dataOf({ ...valid, need: "   \n " }).need).toBeUndefined();
    expect(dataOf({ ...valid, need: null }).need).toBeUndefined();
    expect(dataOf({ ...valid, need: "n".repeat(500) }).need).toHaveLength(500);
    expect(errorsOf({ ...valid, need: "n".repeat(501) })).toEqual({ need: "errors.invalidInput" });
    expect(errorsOf({ ...valid, need: 42 })).toEqual({ need: "errors.invalidInput" });
    expect(errorsOf({ ...valid, need: ["new"] })).toEqual({ need: "errors.invalidInput" });
  });

  it("defaults the contact preference to email and refuses an unknown one", () => {
    expect(dataOf(valid).contactPref).toBe("email");
    expect(dataOf({ ...valid, contactPref: "" }).contactPref).toBe("email");
    expect(errorsOf({ ...valid, contactPref: "pigeon" })).toEqual({
      contactPref: "errors.invalidInput",
    });
  });

  it("asks for a phone number only when the person wants a call", () => {
    expect(errorsOf({ ...valid, contactPref: "call" })).toEqual({
      phone: "errors.phoneRequired",
    });
    expect(errorsOf({ ...valid, contactPref: "call", phone: "   " })).toEqual({
      phone: "errors.phoneRequired",
    });
    expect(errorsOf({ ...valid, contactPref: "call", phone: null })).toEqual({
      phone: "errors.phoneRequired",
    });
  });

  it("keeps the phone number of someone who asked for a call", () => {
    const data = dataOf({ ...valid, contactPref: "call", phone: "  +1 (310)  555-0142 " });
    expect(data.contactPref).toBe("call");
    expect(data.phone).toBe("+1 (310) 555-0142");
  });

  it.each(["call me", "12345", "+".repeat(3) + "1234567", "1".repeat(16), "310-555-0142 ext. 9", "=1+1"])(
    "reports the phone number %j as errors.phoneInvalid",
    (phone) => {
      expect(errorsOf({ ...valid, contactPref: "call", phone })).toEqual({
        phone: "errors.phoneInvalid",
      });
    }
  );

  it("drops a phone number that came without a request for a call, valid or not", () => {
    expect(dataOf({ ...valid, phone: "+1 310 555 0142" })).not.toHaveProperty("phone");
    expect(dataOf({ ...valid, contactPref: "email", phone: "+1 310 555 0142" })).not.toHaveProperty("phone");
    // It is not even validated: the field is ignored.
    expect(dataOf({ ...valid, contactPref: "email", phone: "not a number" })).not.toHaveProperty("phone");
  });
});

describe("cleanPhone", () => {
  it.each([
    ["+33 6 12 34 56 78", "+33 6 12 34 56 78"],
    ["(310) 555-0142", "(310) 555-0142"],
    ["310.555.0142", "310.555.0142"],
    ["  3105550142\n", "3105550142"],
  ])("keeps %j as %j", (typed, kept) => {
    expect(cleanPhone(typed)).toBe(kept);
  });

  it.each(["", "abc", "123456", "1234567890123456", "1 + 2345678", "(1) ".repeat(11), 5, null])(
    "answers null for %j",
    (typed) => {
      expect(cleanPhone(typed)).toBeNull();
    }
  );
});

describe("LIMELIGHT_REFERENCE_PATTERN", () => {
  it("matches LL- and eight Crockford base32 characters", () => {
    expect(LIMELIGHT_REFERENCE_PATTERN.test("LL-7K2M9QXA")).toBe(true);
    for (const wrong of ["LL-7K2M9QX", "LL-7K2M9QXAB", "ll-7k2m9qxa", "LL-ILOU0000", "XX-7K2M9QXA"]) {
      expect(LIMELIGHT_REFERENCE_PATTERN.test(wrong)).toBe(false);
    }
  });
});

describe("LimelightLeadInput (the form on the page today)", () => {
  it("still validates that form's fields", () => {
    const parsed = LimelightLeadInput.safeParse({
      name: " Ana Lee ",
      email: "ana@example.com",
      discipline: "actor",
      need: "new",
      budget: "essential",
      contactPref: "email",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ name: "Ana Lee", phone: "", message: "", locale: "en" });
  });

  it("keeps its own error key for a missing name", () => {
    const parsed = LimelightLeadInput.safeParse({ name: "", email: "ana@example.com" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe("errors.limelightContactRequired");
  });
});
