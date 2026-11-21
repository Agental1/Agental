/**
 * How a plan price is shown, everywhere: public pricing cards, the
 * subscription pages and the plan switcher. Amounts come from
 * `src/domain/pricing.ts` in integer cents; plans are billed in US dollars.
 */
import { B2C_PLANS } from "@/domain/pricing";
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
const TOKEN = /\{(price|commission|searches)(?:_(FREE|PRO|PREMIUM|ULTIMATE))?\}/g;

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

/** A talent plan's feature lines with its figures filled in. */
export function planFeatureLines(lines: string[], locale: string, plan: TalentPlanId): string[] {
  return lines.map((line) => fillPlanTokens(line, locale, plan));
}

/** FAQ groups with the plan figures filled into every answer. */
export function fillFaqGroups<G extends { items: { q: string; a: string }[] }>(groups: G[], locale: string): G[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, a: fillPlanTokens(i.a, locale) })) }));
}
