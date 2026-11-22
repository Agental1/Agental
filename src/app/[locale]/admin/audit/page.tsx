import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { dateTime } from "@/lib/format";
import { auditFiltersFrom, listAudit } from "@/lib/admin/views";
import { FilterBar, Table, field, qs } from "@/components/admin/view-parts";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.audit")}`, robots: { index: false } };
}

/** The audit trail: search by action, resource or actor, newest first, CSV. Read-only. */
export default async function AdminAuditPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const f = auditFiltersFrom((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined));
  const rows = await listAudit(f);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.audit.title")}</h1>
        <p className="text-fg-muted">{t("admin.audit.subtitle")}</p>
      </div>
      <FilterBar csvHref={`/api/admin/audit${qs(f)}`} filterLabel={t("admin.accounts.filter")} csvLabel={t("admin.accounts.csv")}>
        <input name="q" defaultValue={f.q} placeholder={t("admin.views.auditSearch")} aria-label={t("admin.views.auditSearch")} className={`${field} min-w-56`} />
        <input name="action" defaultValue={f.action} placeholder={t("admin.audit.action")} aria-label={t("admin.audit.action")} className={`${field} w-48`} />
      </FilterBar>
      <Table head={[t("admin.audit.date"), t("admin.audit.action"), t("admin.audit.resource"), t("admin.audit.actor")]} minWidth={700}>
        {rows.map((a) => (
          <tr key={a.id} className="border-t border-border">
            <td className="whitespace-nowrap p-3 tabular-nums text-xs text-fg-subtle">{dateTime(a.createdAt, locale)}</td>
            <td className="p-3 font-medium">{a.action}</td>
            <td className="p-3 text-fg-muted">
              {a.resourceType}
              <span className="text-fg-subtle"> · {a.resourceId.slice(0, 12)}</span>
            </td>
            <td className="p-3 text-fg-muted">{a.actor?.email ?? "-"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
