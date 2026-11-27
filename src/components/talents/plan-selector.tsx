"use client";

import { useTranslations } from "next-intl";
import { useActionErrorText } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { upgradeTalentPlan } from "@/app/actions/subscription";
import { BillingToggle, PlanLead, TalentPlanPrice } from "@/components/talents/billing-period";
import { useActivePromotion } from "@/components/talents/promotions";
import { CheckoutPanel } from "@/components/talents/checkout-panel";
import type { UscVerified } from "@/components/talents/usc-verify";

export interface PlanCard {
  plan: string;
  name: string;
  price: string;
  commission: string;
  /** Monthly AI searches (the big element), null when not set. */
  searches: number | null;
  /** Yearly display price, formatted. Display only: checkout never gets it. */
  yearlyPrice: string;
  features: string[];
  /** Promotional prices by promotion id (round 8). */
  promos?: Record<string, string>;
}

export function PlanSelector({
  plans,
  current,
  usc: initialUsc = null,
  onPick,
  pickPending = false,
}: {
  plans: PlanCard[];
  current: string;
  /** Round 8b: "USC student verified" on the account, with the date and address. */
  usc?: UscVerified | null;
  /**
   * Sign-up plans step: choosing only records the pick (no payment, no plan
   * change). Every card's button reads "Continue with ...", Basic included.
   */
  onPick?: (plan: string) => void;
  pickPending?: boolean;
}) {
  const t = useTranslations("talents");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<ActionError | undefined>();
  const errorText = useActionErrorText();

  // Round 8b: a paid plan opens the checkout panel; Basic switches directly.
  const promotion = useActivePromotion();
  const [checkout, setCheckout] = useState<PlanCard | null>(null);
  const [usc, setUsc] = useState<UscVerified | null>(initialUsc);

  function choose(plan: string) {
    if (onPick) {
      onPick(plan);
      return;
    }
    if (plan !== "FREE") {
      setCheckout(plans.find((p) => p.plan === plan) ?? null);
      return;
    }
    setBusy(plan);
    setError(undefined);
    start(async () => {
      const res = await upgradeTalentPlan(plan);
      if (!res.ok) setError(res.error ?? err("errors.generic"));
      else if (res.checkoutUrl) window.location.href = res.checkoutUrl;
      else router.refresh();
      setBusy(undefined);
    });
  }

  return (
    <div className="space-y-3">
      <BillingToggle />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p, i) => {
          const isCurrent = p.plan === current;
          const popular = i === 1;
          return (
            <div
              key={p.plan}
              className={cn(
                "flex flex-col rounded-sedan border bg-surface p-5",
                isCurrent
                  ? "border-accent ring-1 ring-accent"
                  : popular
                    ? "border-accent/60 shadow-sm"
                    : "border-border"
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">{p.name}</h3>
                {isCurrent && <Badge variant="solid">{t("space.plans.current")}</Badge>}
              </div>
              {p.searches !== null && (
                <PlanLead big={String(p.searches)} label={t("pricing.searchesLabel")} className="mt-3" />
              )}
              <ul className="mt-3 flex-1 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <Check className="mt-0.5 size-3 shrink-0 text-success" />
                    <span className="text-fg-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <TalentPlanPrice
                monthly={p.price}
                yearly={p.yearlyPrice}
                promos={p.promos}
                paid={p.plan !== "FREE"}
                unitMonth={t("space.plans.perMonth")}
                unitYear={t("pricing.perYear")}
                className="mt-4 border-t border-border pt-3"
              />
              <Button
                className="mt-4"
                variant={isCurrent ? "outline" : onPick ? "primary" : popular ? "primary" : "secondary"}
                disabled={isCurrent || pending || pickPending}
                onClick={() => choose(p.plan)}
              >
                {(busy === p.plan || (pickPending && onPick)) && <Loader2 className="size-4 animate-spin" />}
                {onPick
                  ? p.plan === "FREE"
                    ? t("onboarding.plans.continueBasic")
                    : t("onboarding.plans.continueWith", { plan: p.name })
                  : isCurrent
                    ? t("space.plans.currentPlan")
                    : t("space.plans.choose")}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{errorText(error)}</p>}
      {!onPick && (
        <>
          <CheckoutPanel
            plan={checkout}
            promotion={promotion}
            usc={usc}
            onUscVerified={setUsc}
            onClose={() => setCheckout(null)}
          />
          <p className="text-xs text-fg-subtle">{t("space.plans.demo")}</p>
        </>
      )}
    </div>
  );
}
