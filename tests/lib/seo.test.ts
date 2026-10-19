import { describe, expect, it } from "vitest";
import { jsonLd, localeAlternates, localeUrl, seo, SITE } from "@/lib/seo";
import { routing, toLocale } from "@/i18n/routing";

/**
 * URL building is shared between the sitemap and the metadata helpers on
 * purpose: two builders that drift emit hreflang pointing at pages that do not
 * exist, and nothing fails loudly when they do. These pin the shape.
 */
describe("localeUrl", () => {
  it("emits unprefixed URLs (English only, localePrefix: never)", () => {
    expect(localeUrl("en", "/talents")).toBe(`${SITE}/talents`);
  });

  it("maps the root path to the site root", () => {
    expect(localeUrl("en", "/")).toBe(`${SITE}/`);
  });

  it("never doubles a slash", () => {
    expect(localeUrl("en", "/castings/")).not.toContain("//castings");
  });
});

describe("localeAlternates", () => {
  it("covers every routed locale plus x-default", () => {
    const alt = localeAlternates("/talents");
    for (const locale of routing.locales) {
      expect(alt[locale]).toBe(localeUrl(locale, "/talents"));
    }
    expect(Object.keys(alt)).toHaveLength(routing.locales.length + 1);
  });

  it("points x-default at the default locale", () => {
    expect(localeAlternates("/talents")["x-default"]).toBe(
      localeUrl(routing.defaultLocale, "/talents")
    );
  });
});

describe("seo", () => {
  const meta = seo({
    locale: "en",
    path: "/talents",
    title: "T",
    description: "D",
  });

  it("sets the canonical to the current locale, not the default", () => {
    expect(meta.alternates?.canonical).toBe(localeUrl("en", "/talents"));
  });

  it("emits an Open Graph image explicitly", () => {
    // Measured, not assumed: with openGraph set through this helper, Next
    // emitted no og:image at all from the file convention.
    expect(meta.openGraph?.images).toBeTruthy();
  });

  it("keeps the og url on the same locale as the canonical", () => {
    expect(meta.openGraph).toMatchObject({ url: localeUrl("en", "/talents") });
  });
});

describe("jsonLd", () => {
  it("escapes < so a payload cannot close the script tag early", () => {
    const out = jsonLd({ name: "</script><img onerror=alert(1)>" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("still round-trips as JSON", () => {
    const out = jsonLd({ a: 1, b: "deux" });
    expect(JSON.parse(out.replace(/\\u003c/g, "<"))).toEqual({ a: 1, b: "deux" });
  });
});

describe("toLocale", () => {
  it("passes routed locales through untouched", () => {
    for (const locale of routing.locales) {
      expect(toLocale(locale)).toBe(locale);
    }
  });

  it("coerces an unknown segment to the default", () => {
    expect(toLocale("xx")).toBe(routing.defaultLocale);
  });

  it("is a coercion, not a guard — callers that must 404 check the raw value", () => {
    // Documents the review finding: putting toLocale() before hasLocale() in
    // [locale]/layout.tsx made notFound() unreachable.
    expect(toLocale("de")).toBe(routing.defaultLocale);
    expect(routing.locales).not.toContain("de");
  });
});
