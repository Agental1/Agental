import { dateTime } from "@/lib/format";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Users,
  UserCheck,
  Building2,
  FolderKanban,
  Send,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { signupTotals } from "@/lib/admin/accounts";
import { jobCounts } from "@/lib/admin/jobs";
import { countWaitingThreads } from "@/lib/messages";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang — ${t("admin.nav.overview")}` };
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
  const [totals, waiting, newLeads, jobs, projects, pendingMinors, recentAudits] = await Promise.all([
    signupTotals(),
    countWaitingThreads(viewerId),
    prisma.limelightLead.count({ where: { status: "NEW" } }),
    jobCounts(),
    prisma.project.count(),
    prisma.minorCase.count({ where: { state: { not: "READY" } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const kpis = [
    { label: t("admin.accounts.totals.performers"), value: totals.performers.total, icon: Users, href: "/admin/comptes?audience=TALENT" },
    { label: t("admin.accounts.totals.casting"), value: totals.casting.total, icon: Building2, href: "/admin/comptes?audience=CASTING" },
    { label: t("admin.accounts.totals.staff"), value: totals.staff, icon: UserCheck, href: "/admin/comptes?status=STAFF" },
    { label: t("admin.accounts.totals.test"), value: totals.test, icon: UserCheck, href: "/admin/comptes?status=TEST" },
    { label: t("admin.accounts.totals.spam"), value: totals.spam, icon: ShieldAlert, href: "/admin/comptes?status=SPAM" },
    { label: t("admin.stats.projects"), value: projects, icon: FolderKanban, href: "/admin" },
  ];
  const todo = [
    { label: t("admin.nav.waiting"), value: waiting, icon: MessageSquare, href: "/admin/messages?waiting=1" },
    { label: t("admin.hub.newLeads"), value: newLeads, icon: Send, href: "/admin/limelight?status=NEW" },
    { label: t("admin.hub.toReview"), value: totals.performers.unreviewed + totals.casting.unreviewed, icon: Users, href: "/admin/comptes?status=UNREVIEWED" },
    { label: t("admin.hub.jobs", { queued: jobs.queued, running: jobs.running, failed: jobs.failed }), value: jobs.queued + jobs.running, icon: FolderKanban, href: "/admin/recherches" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.title")}</h1>
        <p className="text-fg-muted">{t("admin.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="rounded-sedan border border-border bg-surface p-4 transition-colors hover:border-accent">
            <k.icon className="size-4 text-accent" />
            <p className="mt-2 font-display text-2xl tabular-nums">{k.value}</p>
            <p className="text-xs text-fg-muted">{k.label}</p>
          </Link>
        ))}
      </div>
      <p className="text-xs text-fg-muted">{t("admin.accounts.totals.note")}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {todo.map((k) => (
          <Link key={k.href} href={k.href} className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-4 transition-colors hover:border-accent">
            <k.icon className="size-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-sm font-medium">{k.label}</span>
            <Badge variant={k.value > 0 ? "warning" : "neutral"}>{k.value}</Badge>
          </Link>
        ))}
      </div>

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
