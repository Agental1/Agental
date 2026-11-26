/**
 * How a plan price is shown, everywhere: public pricing cards, the
 * subscription pages and the plan switcher. Amounts come from
 * `src/domain/pricing.ts` in integer cents; plans are billed in US dollars.
 */
import { B2C_PLANS, PROMOTIONS, type PromoProduct } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import { CURRENCY, percent } from "@/lib/format";

export const PLAN_CURRENCY = CURRENCY;

export function formatPlanPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: PLAN_CURRENCY,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type TalentPlanId = PlanB2C;
// The plan names come from the pricing table, so a new plan never shows a raw token.
const TOKEN = new RegExp(`\\{(price|commission|searches)(?:_(${Object.keys(B2C_PLANS).join("|")}))?\\}`, "g");

/**
 * Fills the plan figures into a message line, so no price, commission or
 * search allowance is ever written in the message files. `{commission}` and
 * `{searches}` use the plan the line belongs to; `{commission_PREMIUM}` names
 * one explicitly (the FAQ answer that lists every rate). Raw message arrays
 * (feature lists, FAQ items) skip next-intl's interpolation, hence this.
 */
export function fillPlanTokens(text: string, locale: string, plan?: TalentPlanId): string {
  return text.replace(TOKEN, (whole, field: string, named?: TalentPlanId) => {
    const id = named ?? plan;
    if (!id) return whole;
    const def = B2C_PLANS[id];
    if (field === "price") return formatPlanPrice(def.priceCents, locale);
    if (field === "commission") return percent(def.commissionRate, locale);
    return def.aiSearches ? String(def.aiSearches.count) : whole;
  });
}

/**
 * A talent plan's feature lines with its figures filled in. A plan with no
 * search allowance set loses its searches line rather than showing the token.
 */
export function planFeatureLines(lines: string[], locale: string, plan: TalentPlanId): string[] {
  return lines.map((line) => fillPlanTokens(line, locale, plan)).filter((line) => !line.includes("{searches}"));
}

/** FAQ groups with the plan figures filled into every answer. */
export function fillFaqGroups<G extends { items: { q: string; a: string }[] }>(groups: G[], locale: string): G[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, a: fillPlanTokens(i.a, locale) })) }));
}

/**
 * Promotional prices of one product, formatted, keyed by promotion id (round 8).
 * Read from PROMOTIONS in src/domain/pricing.ts.
 */
export function promoPrices(product: PromoProduct, locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PROMOTIONS) {
    const cents = p.prices[product];
    if (cents != null) out[p.id] = formatPlanPrice(cents, locale);
  }
  return out;
}

/** The monthly AI search count of a talent plan, or null when none is set. */
export function planSearchCount(plan: TalentPlanId): number | null {
  return B2C_PLANS[plan].aiSearches?.count ?? null;
}

/**
 * Benefit lines of a talent plan for the cards that lead with the search
 * count: the searches line is left out (it is the big element) and the
 * figures of the others are filled in.
 */
export function planBenefitLines(lines: string[], locale: string, plan: TalentPlanId): string[] {
  return lines.filter((line) => !line.includes("{searches}")).map((line) => fillPlanTokens(line, locale, plan));
}

/** Yearly display price of a talent plan, formatted. Display only. */
export function planYearlyPrice(plan: TalentPlanId, locale: string): string {
  return formatPlanPrice(B2C_PLANS[plan].yearlyPriceCents, locale);
}
