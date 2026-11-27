import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { B2B_PLANS, B2C_PLANS } from "@/domain/pricing";
import type { PlanB2B, PlanB2C } from "@/domain/enums";
import { formatPlanPrice as formatPrice, planBenefitLines, planSearchCount, planYearlyPrice, promoPrices } from "@/lib/plan-price";
import { BetaBadge, PaymentsNote } from "@/components/ui/beta-price";
import { PromotionsButton, PromotionsProvider } from "@/components/talents/promotions";
import { BillingPeriodProvider, BillingToggle, PlanLead, TalentPlanPrice } from "@/components/talents/billing-period";
import { cn } from "@/lib/utils";

/**
 * Plan cards for both audiences, compact: name, price and one button, with
 * the feature list behind "What's included". The pricing pages pass
 * `expanded` so the lists start open there.
 *
 * Prices come from `src/domain/pricing.ts`, the same table billing reads, so a
 * card can never show a figure the server would not charge. Plan names,
 * feature lines and button labels come from the message files, matched to the
 * table by position.
 */
const TALENT_PLAN_ORDER: PlanB2C[] = ["FREE", "PRO", "PREMIUM", "ULTIMATE"];
const CASTING_PLAN_ORDER: PlanB2B[] = ["FREE", "PRO", "STUDIO", "ENTERPRISE"];

type TalentsPlan = {
  name: string;
  cta: string;
  features: string[];
};
type CastingPlan = {
  name: string;
  price: string;
  priceUnit: string;
  cta: string;
  features: string[];
};

/** Round 12: each card leads with what the plan gives; the price sits small underneath. */

function PlanCard({
  name,
  leadBig,
  leadLabel,
  priceNode,
  badge,
  cta,
  href,
  details,
  lines,
  highlighted,
  expanded,
}: {
  name: string;
  leadBig: string;
  leadLabel: string;
  /** The small price block under the benefits. */
  priceNode: React.ReactNode;
  badge?: string;
  cta: string;
  href: string;
  details: string;
  lines: string[];
  highlighted: boolean;
  expanded: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-sedan-xl border bg-surface p-5",
        highlighted ? "accent-wash border-accent" : "border-border"
      )}
    >
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-[1.25rem] leading-none">{name}</h3>
        {badge && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold leading-none text-accent-fg">
            {badge}
          </span>
        )}
      </div>
      <PlanLead big={leadBig} label={leadLabel} className="mt-5" />
      <details open={expanded} className="group mt-4 border-t border-border pt-1">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sedan text-[14px] font-bold text-accent">
          {details}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <ul className="enter space-y-2 pb-1 pt-1">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-[14px] leading-snug text-fg-muted">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              {line}
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-3 border-t border-border pt-4">{priceNode}</div>
      <Button asChild className="mt-4" variant={highlighted ? "primary" : "secondary"}>
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

/** Talent plans (Free, Pro, Premium, Ultimate); Pro is the highlighted one. */
export function TalentsPricingGrid({
  expanded = false,
  only,
}: {
  expanded?: boolean;
  /** Show only the first n plans (the audience page shows Free and Pro). */
  only?: number;
}) {
  const t = useTranslations("talents.pricing");
  const tc = useTranslations("common.pricing");
  const locale = useLocale();
  const plans = (t.raw("plans") as TalentsPlan[]).slice(0, only);
  return (
    <PromotionsProvider>
    <BillingPeriodProvider>
    <div className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
    <BillingToggle />
    <PromotionsButton />
    </div>
    <div
      className={cn(
        "grid items-start gap-3 sm:grid-cols-2",
        only && only <= 2 ? "max-w-[44rem]" : "lg:grid-cols-4"
      )}
    >
      {plans.map((plan, i) => {
        const id = TALENT_PLAN_ORDER[i];
        const def = B2C_PLANS[id];
        const searches = planSearchCount(id);
        return (
          <PlanCard
            key={plan.name}
            name={plan.name}
            leadBig={searches === null ? "" : String(searches)}
            leadLabel={t("searchesLabel")}
            priceNode={
              <TalentPlanPrice
                monthly={formatPrice(def.priceCents, locale)}
                yearly={planYearlyPrice(id, locale)}
                promos={promoPrices(id, locale)}
                paid={def.priceCents > 0}
                unitMonth={t("perMonth")}
                unitYear={t("perYear")}
              />
            }
            badge={i === 1 ? t("popular") : undefined}
            cta={plan.cta}
            href="/talents/inscription"
            details={tc("details")}
            lines={planBenefitLines(plan.features, locale, id)}
            highlighted={i === 1}
            expanded={expanded}
          />
        );
      })}
    </div>
    </div>
    </BillingPeriodProvider>
    </PromotionsProvider>
  );
}

/** The big element of a Casting card, from the plan table (projects, then seats). */
export function castingLead(
  def: (typeof B2B_PLANS)[PlanB2B],
  t: (key: string, values?: Record<string, number>) => string
): { big: string; label: string } {
  if (def.plan === "ENTERPRISE") return { big: t("lead.custom"), label: t("lead.customLabel") };
  if (def.activeProjects !== null) return { big: String(def.activeProjects), label: t("lead.projects", { count: def.activeProjects }) };
  return { big: t("lead.unlimited"), label: t("lead.unlimitedLabel", { seats: def.maxSeats ?? 0 }) };
}

/** Casting plans (Free, Pro, Studio, Enterprise); Pro is the highlighted one. */
export function CastingPricingGrid({ expanded = false }: { expanded?: boolean }) {
  const t = useTranslations("casting.pricing");
  const tc = useTranslations("common.pricing");
  const locale = useLocale();
  const plans = t.raw("plans") as CastingPlan[];
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, i) => {
        const id = CASTING_PLAN_ORDER[i];
        const def = B2B_PLANS[id];
        // Enterprise is quoted, so its "price" is the wording in the messages.
        const price = id === "ENTERPRISE" ? plan.price : formatPrice(def.priceCents, locale);
        const paid = id !== "ENTERPRISE" && def.priceCents > 0;
        const lead = castingLead(def, (k, v) => t(k, v));
        return (
          <PlanCard
            key={plan.name}
            name={plan.name}
            leadBig={lead.big}
            leadLabel={lead.label}
            priceNode={
              <>
                <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-[1.125rem] font-bold tabular-nums">{price}</span>
                  {plan.priceUnit && <span className="text-[13px] text-fg-muted">{plan.priceUnit}</span>}
                  {paid && <BetaBadge className="ml-1" />}
                </p>
                {paid && <PaymentsNote className="mt-1" />}
              </>
            }
            badge={i === 1 ? t("recommended") : undefined}
            cta={plan.cta}
            href="/casting/inscription"
            details={tc("details")}
            lines={id === "ENTERPRISE" ? plan.features : plan.features.slice(1)}
            highlighted={i === 1}
            expanded={expanded}
          />
        );
      })}
    </div>
  );
}
