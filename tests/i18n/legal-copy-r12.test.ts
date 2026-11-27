import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANDATE } from "@/domain/mandat";

/**
 * Round 12, group 2 (docs/LEGAL_COPY.md): the mandate screen never carries a
 * price or a plan, and the five places read the shared common.legalCopy keys.
 */
const root = process.cwd();
const json = (ns: string) => JSON.parse(readFileSync(join(root, "messages", "en", `${ns}.json`), "utf8"));
const src = (p: string) => readFileSync(join(root, p), "utf8");

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => strings(n, out));
  return out;
}

describe("mandate screen copy", () => {
  const mandateText = [...strings(json("talents").onboarding.mandat), ...strings(json("common").legalCopy.mandate)].join("\n");
  const plans = (json("talents").pricing.plans as { name: string }[]).map((p) => p.name);

  it("has no price token, currency or plan name", () => {
    expect(mandateText).not.toMatch(/\{price\}|\{price_|\$\s?\d|\bUSD\b|\/\s?month|per month/i);
    for (const name of plans) expect(mandateText).not.toMatch(new RegExp(`\\b${name}\\b`, "i"));
    expect(mandateText).not.toMatch(/\bplans?\b.*\b(upgrade|buy|subscribe)\b/i);
  });

  it("keeps signing closed in the beta", () => {
    expect(MANDATE.approvedVersion).toBeNull();
  });
});

describe("shared legalCopy keys", () => {
  const keys = Object.keys(json("common").legalCopy);
  it("exist in English", () => {
    for (const k of ["twoThingsTitle", "repFree", "toolsBody", "humanLoop", "beta", "pricingLine", "commissionNote", "cookiesNever", "mandate"]) {
      expect(keys).toContain(k);
    }
  });

  const places: [string, string[]][] = [
    ["src/components/marketing/two-things.tsx", ["repFree", "toolsBody", "humanLoop"]],
    ["src/app/[locale]/talents/(site)/tarifs/page.tsx", ["pricingLine", "commissionNote"]],
    ["src/components/consent/cookie-banner.tsx", ["cookiesNever"]],
    ["src/app/[locale]/talents/(site)/confidentialite/page.tsx", ["cookiesNever"]],
    ["src/components/onboarding/onboarding-wizard.tsx", ["mandate.free", "mandate.noPayment", "beta"]],
  ];
  it.each(places)("%s reads them", (file, used) => {
    const text = src(file);
    expect(text).toContain("legalCopy");
    for (const k of used) expect(text).toContain(`"${k}"`);
  });

  it("the how page and the home page mount the shared block", () => {
    expect(src("src/components/marketing/how-it-works.tsx")).toContain("<TwoThings");
    expect(src("src/app/[locale]/page.tsx")).toContain("<TwoThings");
  });
});
