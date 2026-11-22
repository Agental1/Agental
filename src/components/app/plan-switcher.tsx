"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { changeOrgPlan, upgradeTalentPlan } from "@/app/actions/subscription";
import { ActionErrorMessage } from "@/components/app/action-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { err, type ActionError } from "@/domain/action-result";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";
import type { RoleSearchQuota } from "@/domain/role-search";
import { SearchUsageBar } from "@/components/app/search-usage";

export interface SwitcherPlan {
  /** Plan id from src/domain/pricing.ts, e.g. "PRO". */
  plan: string;
  name: string;
  price: string;
  unit?: string;
  features: string[];
  /** Quoted plans (Casting Enterprise) cannot be chosen from here. */
  contactOnly?: boolean;
}

/**
 * The plan badge at the top right of the app, and the modal it opens.
 *
 * Compare, choose, confirm: each plan is one row with its price; the selected
 * row shows what it includes; one button confirms. It calls the same server
 * actions as the Subscription page (`upgradeTalentPlan`, `changeOrgPlan`), so
 * the result is identical, and that page stays the place for the full detail.
 */
export function PlanSwitcher({
  portal,
  current,
  plans,
  detailsHref,
  usage,
}: {
  portal: Portal;
  current: string;
  plans: SwitcherPlan[];
  detailsHref: string;
  /** Talent only: "College student? Verify your school email." */
  /** Talent only: AI searches used in the current period. */
  usage?: RoleSearchQuota;
}) {
  const t = useTranslations("common.app");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();

  const currentPlan = plans.find((p) => p.plan === current) ?? plans[0];
  const selectedPlan = plans.find((p) => p.plan === selected) ?? currentPlan;
  const unchanged = selected === current;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelected(current);
      setError(undefined);
    }
  }

  function confirm() {
    setError(undefined);
    start(async () => {
      const res =
        portal === "casting" ? await changeOrgPlan(selected) : await upgradeTalentPlan(selected);
      if (!res.ok) {
        setError(res.error ?? err("errors.generic"));
        return;
      }
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className="pressable inline-flex h-11 items-center gap-2 rounded-full border border-accent/50 bg-surface px-4 text-[14px] font-bold text-accent">
        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
        {t("plan", { name: currentPlan.name })}
      </DialogTrigger>
      <DialogContent
        data-portal={portal}
        className="flex max-h-[calc(100svh-2rem)] w-[calc(100%-1.5rem)] max-w-xl flex-col overflow-y-auto bg-none"
      >
        <DialogHeader>
          <DialogTitle className="text-[1.5rem] font-bold">{t("changePlan")}</DialogTitle>
          <DialogDescription>{t("changePlanLead")}</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label={t("changePlan")} className="space-y-2">
          {plans.map((p) => {
            const isSelected = p.plan === selected;
            const isCurrent = p.plan === current;
            return (
              <div
                key={p.plan}
                className={cn(
                  "rounded-sedan-lg border bg-surface",
                  isSelected ? "accent-wash border-accent" : "border-border"
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(p.plan)}
                  className="pressable flex min-h-14 w-full items-center gap-3 rounded-sedan-lg px-4 py-2.5 text-left [--hover-scale:1.01] [--press-scale:1.02]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      isSelected ? "border-accent bg-accent text-accent-fg" : "border-border-strong"
                    )}
                  >
                    {isSelected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold leading-tight">{p.name}</span>
                    {isCurrent && (
                      <span className="block text-[13px] text-fg-muted">{t("current")}</span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="text-[1.125rem] font-bold tabular-nums">{p.price}</span>
                    {p.unit && <span className="ml-1 text-[13px] text-fg-muted">{p.unit}</span>}
                  </span>
                </button>
                {isSelected && (
                  <ul className="enter space-y-1.5 border-t border-border px-4 py-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[14px] leading-snug text-fg-muted">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <ActionErrorMessage error={error} className="mt-3" />

        {usage && <SearchUsageBar quota={usage} className="mt-3" />}


        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={detailsHref}
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center text-[14px] font-bold text-accent underline-offset-4 hover:underline"
          >
            {t("allDetails")}
          </Link>
          <Button onClick={confirm} disabled={unchanged || pending || selectedPlan.contactOnly}>
            {pending
              ? t("switching")
              : selectedPlan.contactOnly
                ? t("contact")
                : unchanged
                  ? t("confirmCurrent")
                  : t("confirm", { name: selectedPlan.name })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
