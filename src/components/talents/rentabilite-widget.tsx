import { TrendingDown, Info } from "lucide-react";
import { useLocale } from "next-intl";
import { B2C_PLANS } from "@/domain/pricing";
import { euros, percent } from "@/lib/format";
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
  // useLocale() rather than a prop: this renders inside the Talents workspace,
  // where every caller would otherwise have to thread the locale down by hand.
  const locale = useLocale();
  const rows = (Object.keys(B2C_PLANS) as PlanB2C[]).map((plan) => {
    const def = B2C_PLANS[plan];
    const commission = Math.round(annualCachetCents * def.commissionRate);
    const sub = def.priceCents * 12;
    return { plan, def, commission, sub, total: commission + sub };
  });
  const best = rows.reduce((a, b) => (b.total < a.total ? b : a));
  const currentRow = rows.find((r) => r.plan === currentPlan)!;
  const saving = currentRow.total - best.total;

  return (
    <div className="rounded-sedan border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <TrendingDown className="size-5 text-accent" />
        <h2 className="font-display text-lg font-medium">
          Rentabilité de l&apos;abonnement
        </h2>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Sur un volume annuel estimé de{" "}
        <span className="font-medium text-fg">{euros(annualCachetCents, locale)}</span> de
        cachets, voici le coût total (commission + abonnement) par formule.
      </p>

      <div className="mt-4 overflow-hidden rounded-sedan border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Formule</th>
              <th className="px-3 py-2 text-right font-medium">Commission</th>
              <th className="px-3 py-2 text-right font-medium">Abonnement</th>
              <th className="px-3 py-2 text-right font-medium">Total / an</th>
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
                  {r.def.plan}
                  {r.plan === currentPlan && (
                    <span className="ml-1 text-xs text-fg-subtle">(actuel)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {euros(r.commission, locale)} ({percent(r.def.commissionRate, locale)}%)
                </td>
                <td className="px-3 py-2 text-right text-fg-muted">
                  {euros(r.sub, locale)}
                </td>
                <td className="px-3 py-2 text-right">{euros(r.total, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        {saving > 0 ? (
          <span>
            À ton volume, la formule{" "}
            <span className="font-medium">{best.def.plan}</span> te ferait
            économiser <span className="font-medium text-success">{euros(saving, locale)}</span>{" "}
            par an.
          </span>
        ) : (
          <span className="text-fg-muted">
            À ton volume actuel, ta formule <span className="font-medium">{currentPlan}</span>{" "}
            est déjà la plus avantageuse — inutile de payer plus.
          </span>
        )}
      </p>
    </div>
  );
}
