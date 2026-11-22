import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { dateTime } from "@/lib/format";
import { listProfiles, profileFiltersFrom } from "@/lib/admin/views";
import { AccountLink, FilterBar, Table, field, qs } from "@/components/admin/view-parts";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.profiles")}`, robots: { index: false } };
}

/** Every performer profile: completeness (computed), media per category, search, CSV. Read-only. */
export default async function ProfilesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const f = profileFiltersFrom((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined));
  const rows = await listProfiles(f);
  await audit({ actorUserId: adminId, action: "admin.view.profiles", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  const v = "admin.views.";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.nav.profiles")}</h1>
        <p className="text-fg-muted">{t(`${v}profilesSubtitle`, { count: rows.length })}</p>
      </div>
      <FilterBar csvHref={`/api/admin/profils${qs(f)}`} filterLabel={t("admin.accounts.filter")} csvLabel={t("admin.accounts.csv")}>
        <input name="q" defaultValue={f.q} placeholder={t(`${v}search`)} aria-label={t(`${v}search`)} className={`${field} min-w-56`} />
        <select name="complete" defaultValue={f.complete ?? ""} aria-label={t(`${v}complete`)} className={field}>
          <option value="">{t(`${v}complete`)}: {t("admin.accounts.all")}</option>
          <option value="yes">{t("admin.accounts.yes")}</option>
          <option value="no">{t("admin.accounts.no")}</option>
        </select>
      </FilterBar>
      <Table head={[t(`${v}name`), t(`${v}email`), t(`${v}city`), t(`${v}completenessCol`), t(`${v}mediaCol`), t(`${v}selftapes`), t(`${v}created`)]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="p-3"><AccountLink id={r.userId} label={r.stageName || "-"} /></td>
            <td className="p-3">{r.email}</td>
            <td className="p-3">{r.city || "-"}</td>
            <td className="p-3 tabular-nums">{r.completeness}%</td>
            <td className="whitespace-nowrap p-3 tabular-nums text-xs">
              {t(`${v}mediaSplit`, { self: r.media.SELF, productions: r.media.PRODUCTIONS, videos: r.media.VIDEOS, other: r.media.OTHER })}
            </td>
            <td className="p-3 tabular-nums">{r.selftapes}</td>
            <td className="whitespace-nowrap p-3">{dateTime(r.createdAt, locale)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
