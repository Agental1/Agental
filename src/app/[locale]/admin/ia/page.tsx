import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { alertRepeatedFailures, last30Days } from "@/lib/admin/ai-report";
import { aiAccountStates, sendSpendAlerts } from "@/lib/ai-spend";
import { PROVIDER_LABEL } from "@/domain/ai-spend";
import { Table } from "@/components/admin/view-parts";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.ai")}`, robots: { index: false } };
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Round 9, group 9: Admin > AI accounts, the last 30 days: searches, assistant
 * replies, emails, texts, and the AI cost per provider against each budget.
 * Read-only: nothing in Agental can add money at a provider. Opening it also
 * sends any alert due (budget past 80%, a workflow failing again and again).
 */
export default async function AiAccountsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const [report, states] = await Promise.all([last30Days(), aiAccountStates()]);
  await Promise.all([
    sendSpendAlerts(states).catch(() => []),
    alertRepeatedFailures().catch(() => false),
    audit({ actorUserId: adminId, action: "admin.view.ai", resourceType: "AiUsage", resourceId: "*" }),
  ]);
  const a = "admin.ai" as const;
  const s = report.searches;
  const tiles = [
    { label: t(`${a}.tiles.searches`), value: (s.done ?? 0) + (s.failed ?? 0) + (s.running ?? 0) + (s.queued ?? 0) + (s.canceled ?? 0), sub: t(`${a}.tiles.searchesSub`, { done: s.done ?? 0, failed: s.failed ?? 0, queued: s.queued ?? 0 }) },
    { label: t(`${a}.tiles.replies`), value: report.assistantReplies },
    { label: t(`${a}.tiles.emails`), value: report.emails.reduce((n, e) => n + e.n, 0) },
    { label: t(`${a}.tiles.texts`), value: report.texts.filter((x) => x.status === "sent").reduce((n, x) => n + x.n, 0) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${a}.title`)}</h1>
        <p className="max-w-3xl text-fg-muted">{t(`${a}.subtitle`)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-sedan border border-border bg-surface p-4">
            <p className="font-display text-2xl tabular-nums">{x.value}</p>
            <p className="text-xs font-bold">{x.label}</p>
            {x.sub && <p className="text-xs text-fg-muted">{x.sub}</p>}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">{t(`${a}.cost`)}</h2>
        <Table head={[t(`${a}.cols.provider`), t(`${a}.cols.jobs`), t(`${a}.cols.tokens`), t(`${a}.cols.spent`), t(`${a}.cols.budget`), t(`${a}.cols.used`)]} minWidth={720}>
          {report.providers.map((p) => (
            <tr key={p.provider} className="border-t border-border">
              <td className="p-3 font-bold">{PROVIDER_LABEL[p.provider]}</td>
              <td className="p-3 tabular-nums">{p.jobs}</td>
              <td className="p-3 tabular-nums">{p.tokens.toLocaleString("en-US")}</td>
              <td className="p-3 tabular-nums">{usd(p.cents)}</td>
              <td className="p-3 tabular-nums">{p.budgetCents ? usd(p.budgetCents) : <span className="text-fg-muted">{t(`${a}.noBudget`)}</span>}</td>
              <td className="p-3">
                {p.share === null ? "-" : <Badge variant={p.share >= 0.8 ? "danger" : p.share >= 0.5 ? "warning" : "success"}>{Math.round(p.share * 100)}%</Badge>}
              </td>
            </tr>
          ))}
        </Table>
        <p className="text-xs text-fg-muted">{t(`${a}.costNote`)}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-display text-lg font-medium">{t(`${a}.emails`)}</h2>
          {report.emails.length === 0 ? (
            <p className="text-sm text-fg-muted">{t(`${a}.none`)}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.emails.map((e) => (
                <li key={e.kind} className="flex justify-between gap-4 border-b border-border py-1">
                  <span className="font-mono text-xs">{e.kind}</span>
                  <span className="tabular-nums">{e.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="font-display text-lg font-medium">{t(`${a}.texts`)}</h2>
          {report.texts.length === 0 ? (
            <p className="text-sm text-fg-muted">{t(`${a}.none`)}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {report.texts.map((x) => (
                <li key={`${x.kind}-${x.status}`} className="flex justify-between gap-4 border-b border-border py-1">
                  <span className="font-mono text-xs">{x.kind} · {x.status}</span>
                  <span className="tabular-nums">{x.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-sm">
        <Link href="/admin" className="font-bold text-accent hover:underline">
          {t(`${a}.balances`)}
        </Link>
      </p>
    </div>
  );
}
