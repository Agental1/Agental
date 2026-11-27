"use client";

import { createContext, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { BetaBadge, PaymentsNote } from "@/components/ui/beta-price";
import { PromoPrice, useActivePromotion } from "@/components/talents/promotions";
import { cn } from "@/lib/utils";

/**
 * Monthly or yearly view of the Talent plan prices (round 12). Display only:
 * payments are off and checkout never receives a yearly price. Yearly is 10
 * months for 12, from `yearlyPriceCents` in src/domain/pricing.ts. Student
 * promotion prices exist monthly only, so they show in the monthly view.
 */
type Period = "monthly" | "yearly";

const BillingContext = createContext<{ period: Period; setPeriod: (p: Period) => void }>({
  period: "monthly",
  setPeriod: () => undefined,
});

export function BillingPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<Period>("monthly");
  return <BillingContext.Provider value={{ period, setPeriod }}>{children}</BillingContext.Provider>;
}

export function BillingToggle({ className }: { className?: string }) {
  const t = useTranslations("talents.pricing.billing");
  const { period, setPeriod } = useContext(BillingContext);
  const promo = useActivePromotion();
  const options: Period[] = ["monthly", "yearly"];
  return (
    <div className={cn("space-y-1.5", className)}>
      <div role="group" aria-label={t("label")} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={period === o}
            onClick={() => setPeriod(o)}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-[14px] font-bold transition-colors",
              period === o ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
            )}
          >
            {t(o)}
            {o === "yearly" && <span className="text-[12px] font-bold opacity-90">{t("save")}</span>}
          </button>
        ))}
      </div>
      {period === "yearly" && promo && <p className="text-[13px] text-fg-muted">{t("promoMonthlyOnly")}</p>}
    </div>
  );
}

/** The small price line under the benefits: figure, unit, Beta label, payments note. */
export function TalentPlanPrice({
  monthly,
  yearly,
  promos,
  paid,
  unitMonth,
  unitYear,
  className,
  figureClassName = "text-[1.125rem] font-bold tabular-nums",
}: {
  monthly: string;
  yearly: string;
  promos?: Record<string, string>;
  paid: boolean;
  unitMonth: string;
  unitYear: string;
  className?: string;
  figureClassName?: string;
}) {
  const { period } = useContext(BillingContext);
  const yearlyView = period === "yearly" && paid;
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        {yearlyView ? (
          <span className={figureClassName}>{yearly}</span>
        ) : (
          <PromoPrice base={monthly} promos={promos} className={figureClassName} />
        )}
        <span className="text-[13px] text-fg-muted">{yearlyView ? unitYear : unitMonth}</span>
        {paid && <BetaBadge className="ml-1" />}
      </p>
      {paid && <PaymentsNote className="mt-1" />}
    </div>
  );
}

/** The big element of a card: a figure and what it counts. */
export function PlanLead({ big, label, className }: { big: string; label: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[2.75rem] font-bold leading-none tracking-[-0.03em] tabular-nums">{big}</p>
      <p className="mt-1.5 text-[14px] font-bold leading-snug">{label}</p>
    </div>
  );
}
