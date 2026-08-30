import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import {
  Users,
  UserCheck,
  Building2,
  FolderKanban,
  Send,
  ShieldAlert,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Bang — Supervision" };

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const [
    talents,
    castings,
    activeProfiles,
    orgs,
    projects,
    candidatures,
    pendingMinors,
    recentAudits,
  ] = await Promise.all([
    prisma.user.count({ where: { kind: "TALENT" } }),
    prisma.user.count({ where: { kind: "CASTING" } }),
    prisma.artistProfile.count({ where: { status: "ACTIVE" } }),
    prisma.organization.count(),
    prisma.project.count(),
    prisma.candidature.count(),
    prisma.minorCase.count({ where: { state: { not: "READY" } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const kpis = [
    { label: "Artistes", value: talents, icon: Users },
    { label: "Profils actifs", value: activeProfiles, icon: UserCheck },
    { label: "Directeurs casting", value: castings, icon: Users },
    { label: "Organisations", value: orgs, icon: Building2 },
    { label: "Projets", value: projects, icon: FolderKanban },
    { label: "Candidatures", value: candidatures, icon: Send },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-medium">Supervision</h1>
        <p className="text-fg-muted">
          Back-office interne — pilotage, conformité et audit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-sedan border border-border bg-surface p-4">
            <k.icon className="size-4 text-accent" />
            <p className="mt-2 font-display text-2xl">{k.value}</p>
            <p className="text-xs text-fg-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Link
          href="/admin/mineurs"
          className="flex items-center gap-4 rounded-sedan border border-warning/40 bg-warning/5 p-5 transition-colors hover:border-warning"
        >
          <ShieldAlert className="size-8 text-warning" />
          <div>
            <p className="font-medium">Dossiers mineurs à traiter</p>
            <p className="text-sm text-fg-muted">
              Autorisations, séquestre et présence parentale à valider.
            </p>
          </div>
          <Badge variant={pendingMinors > 0 ? "warning" : "success"} className="ml-auto">
            {pendingMinors}
          </Badge>
        </Link>

        <div className="rounded-sedan border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium">Activité récente</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {recentAudits.length === 0 ? (
              <li className="text-fg-muted">Aucune activité.</li>
            ) : (
              recentAudits.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-fg-muted">
                  <span className="tabular-nums text-xs text-fg-subtle">
                    {a.createdAt.toLocaleString("fr-FR")}
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
