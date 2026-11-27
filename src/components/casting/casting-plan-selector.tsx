"use client";

import { BetaBadge, PaymentsNote } from "@/components/ui/beta-price";
import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlanLead } from "@/components/talents/billing-period";
import { changeOrgPlan } from "@/app/actions/subscription";

export interface CastingPlanCard {
  plan: string;
  name: string;
  price: string;
  priceUnit: string;
  /** The big element: what the plan gives (projects, or seats). */
  leadBig: string;
  leadLabel: string;
  features: string[];
  contactOnly?: boolean;
}

export function CastingPlanSelector({
  plans,
  current,
  seatCount,
}: {
  plans: CastingPlanCard[];
  current: string;
  seatCount: number;
}) {
  const t = useTranslations("casting");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();

  function choose(plan: string) {
    setBusy(plan);
    setError(undefined);
    start(async () => {
      const res = await changeOrgPlan(plan);
      if (!res.ok) setError(res.error ?? err("errors.generic"));
      else if (res.checkoutUrl) window.location.href = res.checkoutUrl;
      else router.refresh();
      setBusy(undefined);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => {
          const isCurrent = p.plan === current;
          const recommended = i === 1;
          const paid = p.plan !== "FREE" && !p.contactOnly;
          return (
            <div
              key={p.plan}
              className={cn(
                "flex flex-col rounded-sedan border bg-surface p-5",
                isCurrent ? "border-accent ring-1 ring-accent" : recommended ? "border-accent/60" : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">{p.name}</h3>
                {isCurrent && <Badge variant="solid">{t("space.plans.current")}</Badge>}
              </div>
              <PlanLead big={p.leadBig} label={p.leadLabel} className="mt-3" />
              <ul className="mt-4 flex-1 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <Check className="mt-0.5 size-3 shrink-0 text-success" />
                    <span className="text-fg-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex flex-wrap items-baseline gap-1">
                  <span className="text-lg font-bold">{p.price}</span>
                  {p.priceUnit && <span className="text-xs text-fg-muted">{p.priceUnit}</span>}
                  {paid && <BetaBadge className="ml-1" />}
                </div>
                {paid && <PaymentsNote className="mt-1 text-xs" />}
                {p.plan === "PRO" && (
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {t("space.plans.activeSeats", { count: seatCount })}
                  </p>
                )}
              </div>
              <Button
                className="mt-4"
                variant={isCurrent ? "outline" : recommended ? "primary" : "secondary"}
                disabled={isCurrent || pending || p.contactOnly}
                onClick={() => choose(p.plan)}
              >
                {busy === p.plan && <Loader2 className="size-4 animate-spin" />}
                {isCurrent
                  ? t("space.plans.currentPlan")
                  : p.contactOnly
                    ? t("space.plans.contact")
                    : t("space.plans.choose")}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{errorText(error)}</p>}
      <p className="text-xs text-fg-subtle">{t("space.plans.demo")}</p>
    </div>
  );
}
