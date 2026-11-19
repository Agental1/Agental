import { useTranslations } from "next-intl";
import { TrendingDown, Info } from "lucide-react";
import { useLocale } from "next-intl";
import { B2C_PLANS } from "@/domain/pricing";
import { money, percent } from "@/lib/format";
import { formatPlanPrice } from "@/lib/plan-price";
import { cn } from "@/lib/utils";
import type { PlanB2C } from "@/domain/enums";



/**
 * Honest subscription arbitrage: for a given annual cachet volume, total yearly
 * cost = commission + subscription. Recommends the cheapest — including staying
 * put when upgrading wouldn't pay off (§2.3 ethical guardrail).
 */
export function RentabiliteWidget({
  annualCachetCents,
  currentPlan,
}: {
  annualCachetCents: number;
  currentPlan: PlanB2C;
}) {
  const t = useTranslations("talents");
  // useLocale() rather than a prop: this renders inside the Talents workspace,
  // where every caller would otherwise have to thread the locale down by hand.
  const locale = useLocale();
  // Display names come from the messages, in the order of the B2C_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const rows = (Object.keys(B2C_PLANS) as PlanB2C[]).map((plan, i) => {
    const def = B2C_PLANS[plan];
    const commission = Math.round(annualCachetCents * def.commissionRate);
    const sub = def.priceCents * 12;
    return { plan, name: planNames[i] ?? plan, def, commission, sub, total: commission + sub };
  });
  const best = rows.reduce((a, b) => (b.total < a.total ? b : a));
  const currentRow = rows.find((r) => r.plan === currentPlan)!;
  const saving = currentRow.total - best.total;

  return (
    <div className="rounded-sedan border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <TrendingDown className="size-5 text-accent" />
        <h2 className="font-display text-lg font-medium">{t("space.profitability.title")}</h2>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        {t.rich("space.profitability.intro", {
          amount: money(annualCachetCents, locale),
          strong: (chunks) => (
            <span className="font-medium text-fg">{chunks}</span>
          ),
        })}
      </p>

      <div className="mt-4 overflow-hidden rounded-sedan border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">
                {t("space.profitability.columns.plan")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("space.profitability.columns.commission")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("space.profitability.columns.subscription")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("space.profitability.columns.total")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={r.plan}
                className={cn(
                  r.plan === best.plan ? "bg-accent-soft/50" : "bg-surface",
                  r.plan === currentPlan && "font-medium"
                )}
              >
                <td className="px-3 py-2">
                  {r.name}
                  {r.plan === currentPlan && (
                    <span className="ml-1 text-xs text-fg-subtle">
                      {t("space.profitability.current")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {money(r.commission, locale)} ({percent(r.def.commissionRate, locale)})
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {formatPlanPrice(r.sub, locale)}
                </td>
                <td className="px-3 py-2 text-right">{money(r.total, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        {saving > 0 ? (
          <span>
            {t("space.profitability.save", {
              plan: best.name,
              amount: money(saving, locale),
            })}
          </span>
        ) : (
          <span className="text-fg-muted">
            {t("space.profitability.best", { plan: currentRow.name })}
          </span>
        )}
      </p>
    </div>
  );
}
