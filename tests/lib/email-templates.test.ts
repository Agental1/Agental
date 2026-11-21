import { describe, expect, it } from "vitest";
import enApp from "../../messages/en/app.json";
import frApp from "../../messages/fr/app.json";
import esApp from "../../messages/es/app.json";
import zhApp from "../../messages/zh/app.json";
import {
  escapeHtml,
  passwordResetEmail,
  verificationEmail,
} from "@/lib/email-templates";

/**
 * The two emails in the four locales. The strings come from the message
 * files, so the tests read the same files and check where each one lands.
 */

const VERIFY_LINK = "https://www.agental.test/fr/verifier?token=AbC-_123";
const RESET_LINK = "https://www.agental.test/fr/reinitialiser?token=AbC-_123";

const emails = { en: enApp.emails, fr: frApp.emails, es: esApp.emails, zh: zhApp.emails };
const locales = ["en", "fr", "es", "zh"] as const;

/** How many URLs a string holds, whatever their scheme. */
const urlCount = (value: string) => (value.match(/[a-z][a-z0-9+.-]*:\/\//gi) ?? []).length;

describe("escapeHtml", () => {
  it("escapes the five characters that matter in text and in attributes", () => {
    expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;"
    );
  });

  it("escapes the ampersand first, so nothing is escaped twice", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe.each(locales)("verificationEmail in %s", (locale) => {
  const s = emails[locale];
  const email = verificationEmail(locale, VERIFY_LINK);

  it("uses the locale's subject", () => {
    expect(email.subject).toBe(s.verifySubject);
  });

  it("puts every line and the link in the text version", () => {
    for (const line of [s.verifyIntro, s.verifyAction, s.verifyExpiry, s.ignore, s.signature]) {
      expect(email.text).toContain(line);
    }
    expect(email.text.split("\n")).toContain(VERIFY_LINK);
    // The reset wording belongs to the other email.
    expect(email.text).not.toContain(s.resetIntro);
  });

  it("puts every line in the HTML version, escaped", () => {
    for (const line of [s.verifySubject, s.verifyIntro, s.verifyAction, s.verifyExpiry, s.ignore, s.signature]) {
      expect(email.html).toContain(escapeHtml(line));
    }
  });

  it("holds one URL, the link, once in each version", () => {
    expect(urlCount(email.text)).toBe(1);
    expect(urlCount(email.html)).toBe(1);
    expect(email.html).toContain(`<a href="${VERIFY_LINK}"`);
  });
});

describe.each(locales)("passwordResetEmail in %s", (locale) => {
  const s = emails[locale];
  const email = passwordResetEmail(locale, RESET_LINK);

  it("uses the locale's subject", () => {
    expect(email.subject).toBe(s.resetSubject);
  });

  it("puts every line and the link in the text version", () => {
    for (const line of [s.resetIntro, s.resetAction, s.resetExpiry, s.ignore, s.signature]) {
      expect(email.text).toContain(line);
    }
    expect(email.text.split("\n")).toContain(RESET_LINK);
    expect(email.text).not.toContain(s.verifyIntro);
  });

  it("puts every line in the HTML version, escaped", () => {
    for (const line of [s.resetSubject, s.resetIntro, s.resetAction, s.resetExpiry, s.ignore, s.signature]) {
      expect(email.html).toContain(escapeHtml(line));
    }
  });

  it("holds one URL, the link, once in each version", () => {
    expect(urlCount(email.text)).toBe(1);
    expect(urlCount(email.html)).toBe(1);
    expect(email.html).toContain(`<a href="${RESET_LINK}"`);
  });
});

describe("the HTML document", () => {
  const html = verificationEmail("en", VERIFY_LINK).html;

  it("has one heading, one link and a title", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html.match(/<a[\s>]/g)).toHaveLength(1);
    expect(html).toContain(`<title>${enApp.emails.verifySubject}</title>`);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("loads nothing: no image, no stylesheet, no script", () => {
    expect(html).not.toMatch(/<(img|link|script|style|iframe)\b/i);
    expect(html).not.toMatch(/url\(/i);
  });

  it.each([
    ["en", "en"],
    ["fr", "fr"],
    ["es", "es"],
    ["zh", "zh-Hans"],
  ])("declares the language for %s as %s", (locale, tag) => {
    expect(verificationEmail(locale, VERIFY_LINK).html).toContain(`<html lang="${tag}"`);
    expect(passwordResetEmail(locale, RESET_LINK).html).toContain(`<html lang="${tag}"`);
  });

  it("escapes apostrophes from the messages (French has several)", () => {
    const fr = passwordResetEmail("fr", RESET_LINK);
    expect(frApp.emails.resetExpiry).toContain("'");
    expect(fr.html).not.toContain("'");
    expect(fr.html).toContain("&#39;");
    // The text version is plain text and keeps them.
    expect(fr.text).toContain(frApp.emails.resetExpiry);
  });
});

describe("the link", () => {
  it("is escaped in the href, and cannot close the attribute or open a tag", () => {
    const hostile = `https://www.agental.test/en/verifier?token=a&next="><script>alert(1)</script>`;
    const { html, text } = verificationEmail("en", hostile);

    expect(html).not.toContain("<script");
    // The whole link is still inside the one href, quotes and brackets encoded.
    expect(html.match(/<a[\s>]/g)).toHaveLength(1);
    expect(html.match(/<a href="([^"]*)"/)?.[1]).toBe(
      "https://www.agental.test/en/verifier?token=a&amp;next=%22%3E%3Cscript%3Ealert(1)%3C/script%3E"
    );
    // The text version carries the same link on one line, with no markup.
    expect(text).not.toContain("<script");
    expect(urlCount(text)).toBe(1);
  });

  it("cannot break out of its line in the text version", () => {
    const { text } = passwordResetEmail("en", "https://www.agental.test/en/reinitialiser?token=a\nBcc: x@y.test");
    expect(text).not.toContain("\nBcc:");
  });

  it.each([
    ["a javascript: address", "javascript:alert(1)"],
    ["a data: address", "data:text/html,<script>alert(1)</script>"],
    ["a relative path", "/en/verifier?token=abc"],
    ["an empty string", ""],
  ])("refuses %s", (_label, link) => {
    expect(() => verificationEmail("en", link)).toThrow(/email link/i);
    expect(() => passwordResetEmail("en", link)).toThrow(/email link/i);
  });

  it("accepts http for local development", () => {
    const link = "http://localhost:3000/en/verifier?token=abc";
    expect(verificationEmail("en", link).text).toContain(link);
  });
});

describe("an unknown locale", () => {
  it.each(["de", "", "EN", "fr-FR", "../fr"])("falls back to English for %j", (locale) => {
    expect(verificationEmail(locale, VERIFY_LINK)).toEqual(verificationEmail("en", VERIFY_LINK));
    expect(passwordResetEmail(locale, RESET_LINK)).toEqual(passwordResetEmail("en", RESET_LINK));
  });
});
