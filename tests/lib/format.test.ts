import { describe, expect, it } from "vitest";
import { date, dateTime, euros, eurosExact, integer, percent } from "@/lib/format";
import { formatCachet, getCastingType } from "@/data/casting-types";

/**
 * These are the strings a translation pass cannot reach: there is no French
 * WORD in `toLocaleString("fr-FR")`, so an extraction driven by visible copy
 * walks straight past it. Seven call sites did exactly that, and /en rendered
 * "7,5 %".
 *
 * Assertions compare against Intl's own output rather than hardcoded glyphs:
 * ICU changes its space characters between versions (U+00A0 vs U+202F), and a
 * literal expectation would fail on a Node upgrade for no real reason.
 */
describe("euros", () => {
  it("differs between French and English", () => {
    expect(euros(48000, "fr")).not.toBe(euros(48000, "en"));
  });

  it("matches Intl for the locale, rounded to whole euros", () => {
    const expected = new Intl.NumberFormat("fr", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(480);
    expect(euros(48000, "fr")).toBe(expected);
  });

  it("puts the symbol before the amount in English", () => {
    expect(euros(48000, "en")).toMatch(/^€/);
  });

  it("rounds cents rather than truncating", () => {
    expect(euros(49999, "en")).toBe(euros(50000, "en"));
  });
});

describe("eurosExact", () => {
  it("keeps the decimals euros() drops", () => {
    expect(eurosExact(1234, "en")).toContain("12.34");
  });
});

describe("percent", () => {
  it("uses the locale separator instead of a hardcoded comma", () => {
    // The bug: commissionPct did `.replace(".", ",")` unconditionally, so /en
    // showed "7,5 %".
    expect(percent(0.075, "en")).toContain(".");
    expect(percent(0.075, "fr")).toContain(",");
  });

  it("renders whole rates without a stray decimal", () => {
    expect(percent(0.1, "en")).toBe("10%");
  });
});

describe("date and dateTime", () => {
  const when = new Date(Date.UTC(2026, 4, 22, 14, 30));

  it("orders the parts per locale", () => {
    expect(date(when, "fr")).not.toBe(date(when, "en"));
  });

  it("adds a time component only in dateTime", () => {
    expect(dateTime(when, "fr").length).toBeGreaterThan(date(when, "fr").length);
  });
});

describe("formatCachet", () => {
  it("formats a range for a type that has figures", () => {
    const figuration = getCastingType("figuration")!;
    expect(formatCachet(figuration, "en", "Varies")).toBe("€80–€180");
  });

  it("falls back to the translated label when the fee is project-dependent", () => {
    // `createurs` genuinely has no figure — the edge case that broke the
    // "keep every amount numeric" plan.
    const createurs = getCastingType("createurs")!;
    expect(createurs.cachetMin).toBeUndefined();
    expect(formatCachet(createurs, "es", "Variable")).toBe("Variable");
  });

  it("renders the same range differently per locale", () => {
    const figuration = getCastingType("figuration")!;
    expect(formatCachet(figuration, "fr", "Variable")).not.toBe(
      formatCachet(figuration, "en", "Varies")
    );
  });
});

describe("integer", () => {
  it("groups digits the way the locale does, not the way French does", () => {
    // The casting demo used to hardcode "1 240" in JSX, so /en shipped French
    // thin-space grouping. Compare against Intl rather than a literal: ICU
    // swaps its space characters between versions.
    expect(integer(1240, "fr")).toBe(new Intl.NumberFormat("fr").format(1240));
    expect(integer(1240, "en")).toBe(new Intl.NumberFormat("en").format(1240));
  });

  it("actually differs between French and English", () => {
    expect(integer(1240, "fr")).not.toBe(integer(1240, "en"));
  });
});
