"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { upgradeTalentPlan } from "@/app/actions/subscription";

export interface PlanCard {
  plan: string;
  name: string;
  price: string;
  commission: string;
  features: string[];
}

export function PlanSelector({
  plans,
  current,
}: {
  plans: PlanCard[];
  current: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  function choose(plan: string) {
    setBusy(plan);
    setError(undefined);
    start(async () => {
      const res = await upgradeTalentPlan(plan);
      if (!res.ok) setError(res.error ?? "Erreur.");
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
                {isCurrent && <Badge variant="solid">Actuel</Badge>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-2xl">{p.price}</span>
                <span className="text-xs text-fg-muted">/mois</span>
              </div>
              <p className="mt-0.5 text-xs text-fg-subtle">
                commission {p.commission}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <Check className="mt-0.5 size-3 shrink-0 text-success" />
                    <span className="text-fg-muted">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-4"
                variant={isCurrent ? "outline" : popular ? "primary" : "secondary"}
                disabled={isCurrent || pending}
                onClick={() => choose(p.plan)}
              >
                {busy === p.plan && <Loader2 className="size-4 animate-spin" />}
                {isCurrent ? "Plan actuel" : "Choisir"}
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-fg-subtle">
        Mode démo — aucun paiement réel. Le mandat de représentation reste
        gratuit et séparé quel que soit ton plan.
      </p>
    </div>
  );
}
