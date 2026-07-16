import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
              "flex flex-col rounded-sedan border bg-surface p-6",
              popular
                ? "border-accent shadow-md ring-1 ring-accent"
                : "border-border shadow-sm"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">{plan.name}</h3>
              {popular && <Badge variant="solid">{t("popular")}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl">{plan.price}</span>
              <span className="text-sm text-fg-muted">/{t("perMonth")}</span>
            </div>
            <p className="mt-1 text-xs text-fg-subtle">
              {t("commission", { rate: plan.commission })}
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span className="text-fg-muted">{f}</span>
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
              "flex flex-col rounded-sedan border bg-surface p-6",
              recommended ? "border-accent ring-1 ring-accent" : "border-border"
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">{plan.name}</h3>
              {recommended && <Badge variant="solid">{t("recommended")}</Badge>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl">{plan.price}</span>
              {plan.priceUnit && (
                <span className="text-sm text-fg-muted">{plan.priceUnit}</span>
              )}
            </div>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span className="text-fg-muted">{f}</span>
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
