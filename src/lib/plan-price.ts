/**
 * How a plan price is shown, everywhere: public pricing cards, the
 * subscription pages and the plan switcher. Amounts come from
 * `src/domain/pricing.ts` in integer cents; plans are billed in US dollars.
 */
export const PLAN_CURRENCY = "USD";

export function formatPlanPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: PLAN_CURRENCY,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
