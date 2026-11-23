"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { saveAiAccount } from "@/app/actions/ai-spend";

export interface AiAccountRow {
  provider: string;
  label: string;
  source: "live" | "not_connected" | "manual" | "error";
  /** Already formatted, or null. */
  monthSpend: string | null;
  remaining: string | null;
  low: boolean;
  balance: string;
  threshold: string;
  budget: string;
  /** "Balance typed on <date>" or null. */
  balanceNote: string | null;
}

export interface AiAccountLabels {
  title: string;
  lead: string;
  spent: string;
  left: string;
  source: Record<AiAccountRow["source"], string>;
  balance: string;
  threshold: string;
  budget: string;
  save: string;
  saved: string;
  edit: string;
  none: string;
}

/**
 * Round 8d: "AI accounts" on the admin dashboard. Spend this month (read from
 * the provider when a key is set in Vercel), what is left from the balance
 * typed after the last top-up, and the alert settings. Nothing here can add
 * money at a provider.
 */
export function AiAccountsCard({ rows, labels }: { rows: AiAccountRow[]; labels: AiAccountLabels }) {
  return (
    <section aria-labelledby="ai-accounts" className="rounded-sedan border border-border bg-surface p-5">
      <h2 id="ai-accounts" className="font-display text-lg font-medium">
        {labels.title}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{labels.lead}</p>
      <ul className="mt-4 grid gap-4 lg:grid-cols-3">
        {rows.map((r) => (
          <ProviderRow key={r.provider} row={r} labels={labels} />
        ))}
      </ul>
    </section>
  );
}

function ProviderRow({ row, labels }: { row: AiAccountRow; labels: AiAccountLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(row.balance);
  const [threshold, setThreshold] = useState(row.threshold);
  const [budget, setBudget] = useState(row.budget);
  const [error, setError] = useState<ActionError | undefined>();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setDone(false);
    start(async () => {
      const res = await saveAiAccount({ provider: row.provider, balance, threshold, budget }).catch(() => ({
        ok: false as const,
        error: err("errors.generic"),
      }));
      if (!res.ok) return setError(res.error);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <li className="rounded-sedan border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{row.label}</p>
        <Badge variant={row.source === "live" ? "success" : row.source === "error" ? "warning" : "neutral"}>
          {labels.source[row.source]}
        </Badge>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{labels.spent}</dt>
          <dd className="font-medium tabular-nums">{row.monthSpend ?? labels.none}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-muted">{labels.left}</dt>
          <dd className={row.low ? "font-bold tabular-nums text-danger" : "font-medium tabular-nums"}>{row.remaining ?? labels.none}</dd>
        </div>
      </dl>
      {row.balanceNote && <p className="mt-1 text-xs text-fg-muted">{row.balanceNote}</p>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-bold text-accent hover:underline">
          {labels.edit}
        </button>
      ) : (
        <form onSubmit={save} className="mt-3 space-y-2">
          {(
            [
              [labels.balance, balance, setBalance],
              [labels.threshold, threshold, setThreshold],
              [labels.budget, budget, setBudget],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="block text-xs text-fg-muted">
              {label}
              <Input inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} className="mt-1 h-9" placeholder="$" />
            </label>
          ))}
          <ActionErrorMessage error={error} />
          {done && <p className="text-xs text-fg-muted">{labels.saved}</p>}
          <Button type="submit" size="sm" loading={pending}>
            {labels.save}
          </Button>
        </form>
      )}
    </li>
  );
}
