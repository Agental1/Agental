import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/mailer";
import { isAdminAccount } from "@/domain/admin";
import {
  AI_PROVIDERS,
  DEFAULT_THRESHOLD_CENTS,
  PROVIDER_KEY_ENV,
  PROVIDER_LABEL,
  alertsFor,
  dollars,
  monthStart,
  remainingCents,
  type AiProvider,
  type ProviderState,
  type SpendAlert,
  type SpendSource,
} from "@/domain/ai-spend";

/**
 * Round 8d, group 4: the "AI accounts" card. Server-only.
 *
 * Every provider call here is a GET on a usage or cost report: Agental never
 * calls an endpoint that adds money, buys credit or changes billing, and it
 * holds no payment method. Keys live only in Vercel's environment
 * (OPENAI_ADMIN_KEY, ANTHROPIC_ADMIN_KEY); without one the card says
 * "Not connected". Perplexity publishes no spend or balance API, so its
 * balance is typed by hand after each top-up.
 */

export const ALERT_EMAIL = "contact@agental.co";
/** A dashboard reload reuses the providers' answer for this long. */
const CACHE_SECONDS = 15 * 60;
const TIMEOUT_MS = 8000;

type Fetch = typeof fetch;

/** OpenAI: GET /v1/organization/costs (admin key), daily buckets, amount.value in dollars. */
async function openaiSpendCents(key: string, since: Date, f: Fetch): Promise<number> {
  let total = 0;
  let page: string | null = null;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set("start_time", String(Math.floor(since.getTime() / 1000)));
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "180");
    if (page) url.searchParams.set("page", page);
    const res = await f(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    } as RequestInit);
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const body = (await res.json()) as {
      data?: { results?: { amount?: { value?: number; currency?: string } }[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const bucket of body.data ?? []) {
      for (const r of bucket.results ?? []) {
        if ((r.amount?.currency ?? "usd").toLowerCase() === "usd") total += Math.round((r.amount?.value ?? 0) * 100);
      }
    }
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return total;
}

/** Anthropic: GET /v1/organizations/cost_report (Admin API), daily, amounts as decimal strings in cents. */
async function anthropicSpendCents(key: string, since: Date, f: Fetch): Promise<number> {
  let total = 0;
  let page: string | null = null;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", since.toISOString());
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);
    const res = await f(url, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "User-Agent": "Agental-admin/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: CACHE_SECONDS },
    } as RequestInit);
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const body = (await res.json()) as {
      data?: { results?: { amount?: string | number; currency?: string }[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const bucket of body.data ?? []) {
      for (const r of bucket.results ?? []) {
        if ((r.currency ?? "USD").toUpperCase() === "USD") total += Number(r.amount ?? 0);
      }
    }
    if (!body.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return Math.round(total);
}

export async function spendSince(
  provider: AiProvider,
  since: Date,
  env: Record<string, string | undefined> = process.env,
  f: Fetch = fetch
): Promise<{ source: SpendSource; cents: number | null }> {
  const keyName = PROVIDER_KEY_ENV[provider];
  if (!keyName) return { source: "manual", cents: null };
  const key = (env[keyName] ?? "").trim();
  if (!key) return { source: "not_connected", cents: null };
  try {
    const cents = provider === "openai" ? await openaiSpendCents(key, since, f) : await anthropicSpendCents(key, since, f);
    return { source: "live", cents };
  } catch (error) {
    // Never the key or the answer: the status or error name only.
    console.error(`[ai-spend] ${provider} read failed:`, error instanceof Error ? error.message.slice(0, 60) : "unknown");
    return { source: "error", cents: null };
  }
}

/** Round 9: the AI cost recorded by the app since a date, in cents (rounded up). */
export async function recordedSpendCents(provider: AiProvider, since: Date): Promise<number> {
  const r = await prisma.aiUsage.aggregate({ where: { provider, createdAt: { gte: since } }, _sum: { costMicroUsd: true } });
  return Math.ceil((r._sum.costMicroUsd ?? 0) / 10_000);
}

/** The three providers, for the card and the alerts. */
export async function aiAccountStates(now = new Date()): Promise<ProviderState[]> {
  const rows = await prisma.aiProviderAccount.findMany();
  return Promise.all(
    AI_PROVIDERS.map(async (provider): Promise<ProviderState> => {
      const row = rows.find((r) => r.provider === provider);
      const month = await spendSince(provider, monthStart(now));
      // Round 9: without a provider admin key, the cost the app recorded itself
      // (AiUsage, searches and the assistant) keeps the 80% budget alert working.
      const recorded = month.cents === null ? await recordedSpendCents(provider, monthStart(now)) : null;
      const sinceBalance =
        row?.balanceSetAt && month.source === "live" ? await spendSince(provider, row.balanceSetAt) : null;
      return {
        provider,
        source: month.source,
        monthSpendCents: month.cents ?? recorded,
        spendSinceBalanceCents: sinceBalance?.cents ?? null,
        balanceCents: row?.balanceCents ?? null,
        balanceSetAt: row?.balanceSetAt ?? null,
        thresholdCents: row?.thresholdCents ?? DEFAULT_THRESHOLD_CENTS,
        monthlyBudgetCents: row?.monthlyBudgetCents ?? null,
      };
    })
  );
}

function alertText(a: SpendAlert, s: ProviderState): { title: string; body: string } {
  const name = PROVIDER_LABEL[a.provider];
  if (a.kind === "low_balance") {
    const left = remainingCents(s) ?? 0;
    return {
      title: `${name}: balance under ${dollars(s.thresholdCents)}`,
      body: `About ${dollars(left)} left on ${name}. Top up by hand on the provider's site, then type the new balance in Admin > AI accounts.`,
    };
  }
  return {
    title: `${name}: 80% of the monthly budget spent`,
    body: `${dollars(s.monthSpendCents ?? 0)} spent this month on ${name}, budget ${dollars(s.monthlyBudgetCents ?? 0)}.`,
  };
}

function parseSent(raw: string | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Send each alert the states call for, once: a notification in every admin's
 * bell and an email to contact@agental.co (logged until Resend is set up).
 * Returns the alerts sent now.
 */
export async function sendSpendAlerts(states: ProviderState[], now = new Date()): Promise<SpendAlert[]> {
  const sent: SpendAlert[] = [];
  const admins = (await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true, isAdmin: true, email: true } })).filter(
    (u) => isAdminAccount(u)
  );
  for (const s of states) {
    const due = alertsFor(s, now);
    if (due.length === 0) continue;
    const row = await prisma.aiProviderAccount.findUnique({ where: { provider: s.provider } });
    const already = parseSent(row?.lastAlerts);
    let stored: string | null = row?.lastAlerts ?? null;
    for (const a of due) {
      if (already.includes(a.key)) continue;
      // Claim the alert first, so two dashboard loads never send it twice.
      const next = JSON.stringify([...already, a.key].slice(-20));
      const claimed = stored !== null
        ? await prisma.aiProviderAccount.updateMany({ where: { provider: s.provider, lastAlerts: stored }, data: { lastAlerts: next } })
        : await prisma.aiProviderAccount
            .create({ data: { provider: s.provider, lastAlerts: next } })
            .then(() => ({ count: 1 }))
            .catch(() => ({ count: 0 }));
      if (claimed.count !== 1) continue;
      stored = next;
      already.push(a.key);
      const { title, body } = alertText(a, s);
      await prisma.notification.createMany({
        data: admins.map((u) => ({ userId: u.id, kind: "ALERT", title, body, link: "/admin", payload: JSON.stringify({ provider: a.provider, alert: a.kind }) })),
      });
      await sendEmail({ to: ALERT_EMAIL, kind: "ai_spend_alert", subject: `[Agental] ${title}`, text: body, html: `<p>${body}</p>` }).catch(() => {});
      sent.push(a);
    }
  }
  return sent;
}
