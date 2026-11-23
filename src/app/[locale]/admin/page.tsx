import { dateTime } from "@/lib/format";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  FolderKanban,
  Send,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { accountCounts } from "@/lib/admin/accounts";
import { CountCard } from "@/components/admin/count-card";
import { jobCounts } from "@/lib/admin/jobs";
import { countWaitingThreads } from "@/lib/messages";
import { countDraftsToApprove } from "@/lib/reply-drafts";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { AiAccountsCard } from "@/components/admin/ai-accounts-card";
import { aiAccountStates, sendSpendAlerts } from "@/lib/ai-spend";
import { PROVIDER_LABEL, dollars, remainingCents } from "@/domain/ai-spend";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.overview")}` };
}

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });

  const viewerId = await currentAdminId();
  if (!viewerId) notFound();
  const [counts, waiting, newLeads, jobs, projects, pendingMinors, recentAudits, drafts] = await Promise.all([
    accountCounts(),
    countWaitingThreads(viewerId),
    prisma.limelightLead.count({ where: { status: "NEW" } }),
    jobCounts(),
    prisma.project.count(),
    prisma.minorCase.count({ where: { state: { not: "READY" } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    countDraftsToApprove(),
  ]);

  // Round 10: the same counts and definitions as Admin > Accounts.
  const c4 = "admin.accounts.counts" as const;
  const kpis = [
    { key: "accounts", value: counts.accounts, href: "/admin/comptes" },
    { key: "performers", value: counts.performers, href: "/admin/comptes?group=performers" },
    { key: "casting", value: counts.casting, href: "/admin/comptes?group=casting" },
    { key: "staff", value: counts.staff, href: "/admin/comptes?group=staff" },
    { key: "test", value: counts.test, href: "/admin/comptes?group=test" },
    { key: "deleted", value: counts.deleted, href: "/admin/suppression" },
  ];
  const todo = [
    { label: t("admin.stats.projects"), value: projects, icon: FolderKanban, href: "/admin/projets" },
    { label: t("admin.nav.waiting"), value: waiting, icon: MessageSquare, href: "/admin/messages?waiting=1" },
    { label: t("admin.nav.replies"), value: drafts, icon: Send, href: "/admin/reponses" },
    { label: t("admin.hub.newLeads"), value: newLeads, icon: Send, href: "/admin/limelight?status=NEW" },
    { label: t("admin.hub.jobs", { queued: jobs.queued, running: jobs.running, failed: jobs.failed }), value: jobs.queued + jobs.running, icon: FolderKanban, href: "/admin/recherches" },
  ];

  // Round 8d: AI accounts. Reading the card also sends any alert due (once).
  const aiStates = await aiAccountStates();
  await sendSpendAlerts(aiStates).catch((e) => console.error("[ai-spend] alerts failed", e instanceof Error ? e.name : "error"));
  const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
  const aiRows = aiStates.map((st) => {
    const left = remainingCents(st);
    return {
      provider: st.provider,
      label: PROVIDER_LABEL[st.provider],
      source: st.source,
      monthSpend: st.monthSpendCents === null ? null : dollars(st.monthSpendCents),
      remaining: left === null ? null : dollars(left),
      low: left !== null && left < st.thresholdCents,
      balance: money(st.balanceCents),
      threshold: money(st.thresholdCents),
      budget: money(st.monthlyBudgetCents),
      balanceNote: st.balanceSetAt
        ? t("admin.aiAccounts.balanceNote", { amount: dollars(st.balanceCents ?? 0), date: dateTime(st.balanceSetAt, locale) })
        : null,
    };
  });
  const ai = "admin.aiAccounts" as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.title")}</h1>
        <p className="text-fg-muted">{t("admin.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <CountCard key={k.key} label={t(`${c4}.${k.key}.label`)} help={t(`${c4}.${k.key}.help`)} value={k.value} href={k.href} />
        ))}
      </div>
      <p className="text-xs text-fg-muted">{t("admin.accounts.counts.note")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {todo.map((k) => (
          <Link key={k.href} href={k.href} className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-4 transition-colors hover:border-accent">
            <k.icon className="size-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-sm font-medium">{k.label}</span>
            <Badge variant={k.value > 0 ? "warning" : "neutral"}>{k.value}</Badge>
          </Link>
        ))}
      </div>

      <AiAccountsCard
        rows={aiRows}
        labels={{
          title: t(`${ai}.title`),
          lead: t(`${ai}.lead`),
          spent: t(`${ai}.spent`),
          left: t(`${ai}.left`),
          source: {
            live: t(`${ai}.source.live`),
            not_connected: t(`${ai}.source.notConnected`),
            manual: t(`${ai}.source.manual`),
            error: t(`${ai}.source.error`),
          },
          balance: t(`${ai}.balance`),
          threshold: t(`${ai}.threshold`),
          budget: t(`${ai}.budget`),
          save: t(`${ai}.save`),
          saved: t(`${ai}.saved`),
          edit: t(`${ai}.edit`),
          none: t(`${ai}.none`),
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Link
          href="/admin/mineurs"
          className="flex items-center gap-4 rounded-sedan border border-warning/40 bg-warning/5 p-5 transition-colors hover:border-warning"
        >
          <ShieldAlert className="size-8 text-warning" />
          <div>
            <p className="font-medium">{t("admin.minorsTodo")}</p>
            <p className="text-sm text-fg-muted">{t("admin.minorsTodoBody")}</p>
          </div>
          <Badge variant={pendingMinors > 0 ? "warning" : "success"} className="ml-auto">
            {pendingMinors}
          </Badge>
        </Link>

        <div className="rounded-sedan border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium">{t("admin.recent")}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {recentAudits.length === 0 ? (
              <li className="text-fg-muted">{t("admin.noActivity")}</li>
            ) : (
              recentAudits.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-fg-muted">
                  <span className="tabular-nums text-xs text-fg-subtle">
                    {dateTime(a.createdAt, locale)}
                  </span>
                  <span className="font-medium text-fg">{a.action}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
