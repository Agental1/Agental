import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { B2B_PLANS, B2C_PLANS } from "@/domain/pricing";
import type { PlanB2B, PlanB2C } from "@/domain/enums";
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

/** Plans are billed in US dollars. */
const PLAN_CURRENCY = "USD";

function formatPrice(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: PLAN_CURRENCY,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type TalentsPlan = {
  name: string;
  commission: string;
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

function PlanCard({
  name,
  price,
  unit,
  badge,
  cta,
  href,
  details,
  lines,
  highlighted,
  expanded,
}: {
  name: string;
  price: string;
  unit?: string;
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
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[2rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
          {price}
        </span>
        {unit && <span className="text-[14px] text-fg-muted">{unit}</span>}
      </p>
      <Button asChild className="mt-5" variant={highlighted ? "primary" : "secondary"}>
        <Link href={href}>{cta}</Link>
      </Button>
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
    </div>
  );
}

/** Talent plans (Free, Pro, Premium, Ultimate); Pro is the highlighted one. */
export function TalentsPricingGrid({ expanded = false }: { expanded?: boolean }) {
  const t = useTranslations("talents.pricing");
  const tc = useTranslations("common.pricing");
  const locale = useLocale();
  const plans = t.raw("plans") as TalentsPlan[];
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, i) => {
        const def = B2C_PLANS[TALENT_PLAN_ORDER[i]];
        return (
          <PlanCard
            key={plan.name}
            name={plan.name}
            price={formatPrice(def.priceCents, locale)}
            unit={`/ ${t("perMonth")}`}
            badge={i === 1 ? t("popular") : undefined}
            cta={plan.cta}
            href="/talents/inscription"
            details={tc("details")}
            lines={[t("commission", { rate: plan.commission }), ...plan.features]}
            highlighted={i === 1}
            expanded={expanded}
          />
        );
      })}
    </div>
  );
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
        return (
          <PlanCard
            key={plan.name}
            name={plan.name}
            price={price}
            unit={plan.priceUnit || undefined}
            badge={i === 1 ? t("recommended") : undefined}
            cta={plan.cta}
            href="/casting/inscription"
            details={tc("details")}
            lines={plan.features}
            highlighted={i === 1}
            expanded={expanded}
          />
        );
      })}
    </div>
  );
}
