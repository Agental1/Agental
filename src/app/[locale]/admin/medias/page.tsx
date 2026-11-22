import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { dateTime } from "@/lib/format";
import { VIEW_CAP, listMedia, mediaFiltersFrom } from "@/lib/admin/views";
import { AccountLink, FilterBar, Table, field, qs } from "@/components/admin/view-parts";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.media")}`, robots: { index: false } };
}

/**
 * Every media item, newest first, with filters and CSV. Files open only
 * through /api/media/<id> (role checked there, short-lived signed link); no
 * storage key or link is ever shown here.
 */
export default async function MediaPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const f = mediaFiltersFrom((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined));
  const rows = await listMedia(f);
  await audit({ actorUserId: adminId, action: "admin.view.media", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  const v = "admin.views.";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.nav.media")}</h1>
        <p className="text-fg-muted">{t(`${v}mediaSubtitle`, { count: rows.length })}</p>
        {rows.length >= VIEW_CAP && <p className="text-sm font-bold">{t(`${v}capped`, { count: VIEW_CAP })}</p>}
      </div>
      <FilterBar csvHref={`/api/admin/medias${qs(f)}`} filterLabel={t("admin.accounts.filter")} csvLabel={t("admin.accounts.csv")}>
        <input name="q" defaultValue={f.q} placeholder={t(`${v}search`)} aria-label={t(`${v}search`)} className={`${field} min-w-56`} />
        <select name="type" defaultValue={f.type ?? ""} aria-label={t(`${v}type`)} className={field}>
          <option value="">{t(`${v}type`)}: {t("admin.accounts.all")}</option>
          {["PHOTO", "VIDEO", "AUDIO", "SELFTAPE"].map((x) => <option key={x}>{x}</option>)}
        </select>
        <select name="category" defaultValue={f.category ?? ""} aria-label={t(`${v}category`)} className={field}>
          <option value="">{t(`${v}category`)}: {t("admin.accounts.all")}</option>
          {["SELF", "PRODUCTIONS", "VIDEOS", "OTHER"].map((x) => <option key={x}>{x}</option>)}
        </select>
      </FilterBar>
      <Table head={[t(`${v}file`), t(`${v}type`), t(`${v}category`), t(`${v}description`), t(`${v}owner`), t(`${v}status`), t(`${v}created`)]}>
        {rows.map((m) => (
          <tr key={m.id} className="border-t border-border">
            <td className="p-3">
              <a href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="font-bold text-accent hover:underline">
                {t(`${v}open`)}
              </a>
            </td>
            <td className="p-3">{m.type}</td>
            <td className="p-3">{m.category}</td>
            <td className="max-w-64 truncate p-3">{m.description || m.title || "-"}</td>
            <td className="p-3"><AccountLink id={m.profile.user.id} label={m.profile.stageName || m.profile.user.email} /></td>
            <td className="p-3 text-xs">{m.destination} · {m.status}</td>
            <td className="whitespace-nowrap p-3">{dateTime(m.createdAt, locale)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
