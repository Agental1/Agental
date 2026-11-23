import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { projectDetail } from "@/lib/admin/projects";
import { Table } from "@/components/admin/view-parts";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.projects")}`, robots: { index: false } };
}

const day = (d: Date | null, locale: string) => (d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(d) : "-");

/** Round 9, group 1: one project for staff: owner, dates, role, applications and their statuses. */
export default async function AdminProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const project = await projectDetail(id);
  if (!project) notFound();
  await audit({ actorUserId: adminId, action: "admin.view.project", resourceType: "Project", resourceId: id });
  const t = await getTranslations({ locale, namespace: "app" });
  const p = "admin.projects" as const;
  const role = project.role;
  const facts: [string, React.ReactNode][] = [
    [t(`${p}.cols.organization`), `${project.organization.name} (${project.organization.plan})`],
    [
      t(`${p}.cols.owner`),
      project.owner ? (
        <Link href={`/admin/comptes/${project.owner.id}`} className="font-bold text-accent hover:underline">
          {project.owner.name || project.owner.email}
        </Link>
      ) : (
        "-"
      ),
    ],
    [t(`${p}.cols.created`), dateTime(project.createdAt, locale)],
    [t(`${p}.updated`), dateTime(project.updatedAt, locale)],
    [t(`${p}.cols.shooting`), project.shootingFrom ? t(`${p}.range`, { from: day(project.shootingFrom, locale), to: day(project.shootingTo, locale) }) : "-"],
    [t(`${p}.budget`), project.budgetCents === null ? "-" : `$${(project.budgetCents / 100).toLocaleString("en-US")}`],
  ];
  const roleFacts = (
    [
      [t(`${p}.role.role`), role.role],
      [t(`${p}.role.gender`), role.gender],
      [t(`${p}.role.age`), role.ageMin || role.ageMax ? `${role.ageMin ?? "?"} - ${role.ageMax ?? "?"}` : undefined],
      [t(`${p}.role.type`), role.physicalType],
      [t(`${p}.role.language`), role.language],
      [t(`${p}.role.accent`), role.accent],
      [t(`${p}.role.constraints`), role.constraints.join(", ") || undefined],
    ] as [string, string | undefined][]
  ).filter((r): r is [string, string] => !!r[1]);

  return (
    <div className="space-y-6">
      <Link href="/admin/projets" className="text-sm font-bold text-accent hover:underline">
        {t(`${p}.back`)}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-medium">{project.title}</h1>
        <Badge variant="neutral">{t(`${p}.statuses.${project.status}` as never)}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-sedan border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium">{t(`${p}.details`)}</h2>
          <dl className="mt-3 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-sedan border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-medium">{t(`${p}.role.title`)}</h2>
          {roleFacts.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">{t(`${p}.role.empty`)}</p>
          ) : (
            <dl className="mt-3 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
              {roleFacts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium">{t(`${p}.applications`, { count: project.candidatures.length })}</h2>
        {Object.keys(project.statusCounts).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(project.statusCounts).map(([s, n]) => (
              <Badge key={s} variant="neutral">
                {t(`${p}.appStatuses.${s}` as never)}: {n}
              </Badge>
            ))}
          </div>
        )}
        {project.candidatures.length === 0 ? (
          <div className="rounded-sedan border border-dashed border-border p-8 text-center text-sm text-fg-muted">{t(`${p}.noApplications`)}</div>
        ) : (
          <Table head={[t(`${p}.appCols.performer`), t(`${p}.appCols.source`), t(`${p}.appCols.status`), t(`${p}.appCols.score`), t(`${p}.appCols.applied`)]} minWidth={720}>
            {project.candidatures.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3">
                  {c.artistProfile ? (
                    <Link href={`/admin/comptes/${c.artistProfile.user.id}`} className="font-bold text-accent hover:underline">
                      {c.artistProfile.stageName || c.artistProfile.user.email}
                    </Link>
                  ) : (
                    t(`${p}.external`)
                  )}
                </td>
                <td className="p-3">{c.source}</td>
                <td className="p-3">
                  <Badge variant="neutral">{t(`${p}.appStatuses.${c.status}` as never)}</Badge>
                </td>
                <td className="p-3 tabular-nums">{c.matchScore?.score ?? "-"}</td>
                <td className="whitespace-nowrap p-3">{dateTime(c.appliedAt, locale)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
