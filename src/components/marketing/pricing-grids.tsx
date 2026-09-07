import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The highlighted card sits on --surface-inverse, so its secondary text needs
 * the inverse muted role rather than --fg-muted, which would be unreadable.
 *
 * Colour ONLY. It used to also carry `text-sm`, which meant `cn()` — twMerge —
 * resolved the font-size conflict in its favour and silently rendered the 11px
 * commission line at 14px. A helper that names one axis must not smuggle another.
 */
function muted(onInverse: boolean): string {
  return onInverse ? "text-fg-inverse-muted" : "text-fg-muted";
}

type TalentsPlan = {
  name: string;
  price: string;
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

/** B2C pricing cards (Free/Pro/Premium/Ultimate), popular = Pro. */
export function TalentsPricingGrid() {
  const t = useTranslations("talents.pricing");
  const plans = t.raw("plans") as TalentsPlan[];
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, i) => {
        const popular = i === 1;
        return (
          <div
            key={plan.name}
            className={cn(
              "flex flex-col rounded-sedan-xl border p-[clamp(20px,3vw,26px)]",
              popular
                ? "border-transparent bg-surface-inverse text-fg-inverse"
                : "border-border bg-surface"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">{plan.name}</h3>
              {popular && <Badge variant="mono">{t("popular")}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono text-[32px] font-bold leading-none">
                {plan.price}
              </span>
              <span className={cn("text-sm", muted(popular))}>/{t("perMonth")}</span>
            </div>
            <p className={cn("mt-1.5 font-mono text-[11px]", muted(popular))}>
              {t("commission", { rate: plan.commission })}
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      popular ? "text-success-inverse" : "text-success"
                    )}
                  />
                  <span className={muted(popular)}>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              className="mt-6"
              variant={popular ? "primary" : "secondary"}
            >
              <Link href="/talents/inscription">{plan.cta}</Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** B2B pricing cards (Free/Pro/Studio/Enterprise), recommended = Pro. */
export function CastingPricingGrid() {
  const t = useTranslations("casting.pricing");
  const plans = t.raw("plans") as CastingPlan[];
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, i) => {
        const recommended = i === 1;
        return (
          <div
            key={plan.name}
            className={cn(
              "flex flex-col rounded-sedan-xl border p-[clamp(20px,3vw,26px)]",
              recommended
                ? "border-transparent bg-surface-inverse text-fg-inverse"
                : "border-border bg-surface"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">{plan.name}</h3>
              {recommended && <Badge variant="mono">{t("recommended")}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-mono text-[32px] font-bold leading-none">
                {plan.price}
              </span>
              {plan.priceUnit && (
                <span className={cn("text-sm", muted(recommended))}>{plan.priceUnit}</span>
              )}
            </div>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      recommended ? "text-success-inverse" : "text-success"
                    )}
                  />
                  <span className={muted(recommended)}>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              className="mt-6"
              variant={recommended ? "primary" : "secondary"}
            >
              <Link href="/casting/inscription">{plan.cta}</Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
