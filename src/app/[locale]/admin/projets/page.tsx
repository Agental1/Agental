import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { listProjects } from "@/lib/admin/projects";
import { Table } from "@/components/admin/view-parts";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.projects")}`, robots: { index: false } };
}

const day = (d: Date | null, locale: string) => (d ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(d) : "");

/** Round 9, group 1: every casting project; each row opens its detail. Admins only, view logged. */
export default async function AdminProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await listProjects(q);
  await audit({ actorUserId: adminId, action: "admin.view.projects", resourceType: "Project", resourceId: "*", after: { count: rows.length } });
  const p = "admin.projects" as const;
  const field = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${p}.title`)}</h1>
        <p className="text-fg-muted">{t(`${p}.subtitle`, { count: rows.length })}</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold">
          {t(`${p}.search`)}
          <input name="q" type="search" defaultValue={q} className={`${field} min-w-64`} />
        </label>
        <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t("admin.accounts.filter")}</button>
      </form>
      {rows.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border p-8 text-center">
          <p className="font-bold">{t(`${p}.empty`)}</p>
          <p className="mt-1 text-sm text-fg-muted">{t(`${p}.emptyHint`)}</p>
        </div>
      ) : (
        <Table head={[t(`${p}.cols.title`), t(`${p}.cols.organization`), t(`${p}.cols.owner`), t(`${p}.cols.status`), t(`${p}.cols.shooting`), t(`${p}.cols.applications`), t(`${p}.cols.created`)]} minWidth={900}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
              <td className="p-3">
                <Link href={`/admin/projets/${r.id}`} className="font-bold text-accent hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="p-3">{r.organization}</td>
              <td className="p-3">
                {r.owner ? (
                  <Link href={`/admin/comptes/${r.owner.id}`} className="hover:underline">
                    {r.owner.name || r.owner.email}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="p-3">
                <Badge variant="neutral">{t(`${p}.statuses.${r.status}` as never)}</Badge>
              </td>
              <td className="whitespace-nowrap p-3">{r.shootingFrom ? (r.shootingTo ? t(`${p}.range`, { from: day(r.shootingFrom, locale), to: day(r.shootingTo, locale) }) : day(r.shootingFrom, locale)) : "-"}</td>
              <td className="p-3 tabular-nums">{r.applications}</td>
              <td className="whitespace-nowrap p-3">{dateTime(r.createdAt, locale)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
