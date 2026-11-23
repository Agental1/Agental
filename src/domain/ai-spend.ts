/**
 * Round 8d, group 4: "AI accounts" on the admin dashboard. Pure rules, so the
 * alerts can be tested without a provider.
 *
 * Agental only READS spend: nothing here can add money, buy credit or change
 * billing at a provider. The founders top up by hand and type the new
 * balance; what is left is that balance minus what was spent since.
 */

export const AI_PROVIDERS = ["openai", "perplexity", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  perplexity: "Perplexity",
  anthropic: "Anthropic (Claude)",
};

/** The Vercel variable holding each provider's key; null: the provider has no spend API. */
export const PROVIDER_KEY_ENV: Record<AiProvider, string | null> = {
  openai: "OPENAI_ADMIN_KEY",
  perplexity: null,
  anthropic: "ANTHROPIC_ADMIN_KEY",
};

export const DEFAULT_THRESHOLD_CENTS = 2000;
/** Alert when a month's spend passes this share of the budget. */
export const BUDGET_ALERT_SHARE = 0.8;

/** "live": read from the provider; "not_connected": key missing; "manual": no API; "error": the read failed. */
export type SpendSource = "live" | "not_connected" | "manual" | "error";

export interface ProviderState {
  provider: AiProvider;
  source: SpendSource;
  /** Spend since the first of this month (UTC), when read. */
  monthSpendCents: number | null;
  /** Spend since the balance was typed, when read. */
  spendSinceBalanceCents: number | null;
  balanceCents: number | null;
  balanceSetAt: Date | null;
  thresholdCents: number;
  monthlyBudgetCents: number | null;
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** What is left: the typed balance minus the spend since (the balance alone when spend cannot be read). */
export function remainingCents(s: ProviderState): number | null {
  if (s.balanceCents === null) return null;
  return s.balanceCents - (s.spendSinceBalanceCents ?? 0);
}

export interface SpendAlert {
  /** Unique per occurrence, so each alert is sent once. */
  key: string;
  kind: "low_balance" | "budget";
  provider: AiProvider;
}

/** The alerts this state calls for. */
export function alertsFor(s: ProviderState, now: Date): SpendAlert[] {
  const out: SpendAlert[] = [];
  const left = remainingCents(s);
  if (left !== null && left < s.thresholdCents) {
    out.push({ key: `${s.provider}:low:${s.balanceSetAt?.toISOString() ?? "none"}`, kind: "low_balance", provider: s.provider });
  }
  if (s.monthlyBudgetCents && s.monthSpendCents !== null && s.monthSpendCents > s.monthlyBudgetCents * BUDGET_ALERT_SHARE) {
    const month = monthStart(now).toISOString().slice(0, 7);
    out.push({ key: `${s.provider}:budget:${month}`, kind: "budget", provider: s.provider });
  }
  return out;
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** "$20" or "20.50" typed in a form, to cents; null when blank, undefined when unreadable. */
export function centsFromInput(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/[$,\s]/g, "");
  if (!text) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return undefined;
  return Math.round(Number(text) * 100);
}
