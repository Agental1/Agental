import { percent } from "@/lib/format";
import { formatPlanPrice, planBenefitLines, planSearchCount, planYearlyPrice, promoPrices } from "@/lib/plan-price";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import type { PlanCard } from "@/components/talents/plan-selector";

type Translator = { raw: (key: string) => unknown };

/** The talent plan cards (Settings > Subscription and the sign-up plans step), all figures from the pricing table. */
export function talentPlanCards(t: Translator, locale: string): PlanCard[] {
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  return (Object.keys(B2C_PLANS) as PlanB2C[]).map((p, i) => ({
    plan: p,
    name: planNames[i] ?? p,
    price: formatPlanPrice(B2C_PLANS[p].priceCents, locale),
    commission: percent(B2C_PLANS[p].commissionRate, locale),
    searches: planSearchCount(p),
    yearlyPrice: planYearlyPrice(p, locale),
    features: planBenefitLines(t.raw(`space.planFeatures.${p}`) as string[], locale, p),
    promos: promoPrices(p, locale),
  }));
}
