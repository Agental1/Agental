import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { emailSenderConfigured } from "@/lib/mailer";
import { FilterBar, Table, field } from "@/components/admin/view-parts";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.emails")}`, robots: { index: false } };
}

const STATUSES = ["queued", "sent", "logged", "failed", "delivered", "bounced", "complained", "delayed"];

/** The email log: every email the app sent, with Resend's delivery status. Read-only. */
export default async function EmailsPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : "";
  const rows = await prisma.emailLog.findMany({
    where: { ...(q ? { OR: [{ to: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { kind: q }] } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  await audit({ actorUserId: adminId, action: "admin.view.emails", resourceType: "Admin", resourceId: "*", after: { count: rows.length } });
  const v = "admin.views.";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.nav.emails")}</h1>
        <p className="text-fg-muted">{t(`${v}emailsSubtitle`)}</p>
        {!emailSenderConfigured() && <p className="mt-2 text-sm font-bold text-danger">{t("admin.cleanup.noSender")}</p>}
        {!process.env.RESEND_WEBHOOK_SECRET && <p className="mt-1 text-sm text-fg-muted">{t(`${v}noWebhook`)}</p>}
      </div>
      <FilterBar csvHref={`/api/admin/emails${q || status ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}` : ""}`} filterLabel={t("admin.accounts.filter")} csvLabel={t("admin.accounts.csv")}>
        <input name="q" defaultValue={q} placeholder={t(`${v}emailSearch`)} aria-label={t(`${v}emailSearch`)} className={`${field} min-w-56`} />
        <select name="status" defaultValue={status} aria-label={t(`${v}status`)} className={field}>
          <option value="">{t(`${v}status`)}: {t("admin.accounts.all")}</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </FilterBar>
      <Table head={[t(`${v}created`), t(`${v}to`), t(`${v}subject`), t(`${v}kind`), t(`${v}status`), t(`${v}lastEvent`)]} minWidth={800}>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="whitespace-nowrap p-3 text-xs">{dateTime(r.createdAt, locale)}</td>
            <td className="p-3">{r.to}</td>
            <td className="max-w-72 truncate p-3">{r.subject}</td>
            <td className="p-3 text-xs">{r.kind}</td>
            <td className="p-3 font-mono text-xs">{r.status}{r.error ? ` (${r.error})` : ""}</td>
            <td className="whitespace-nowrap p-3 text-xs">{r.lastEventAt ? dateTime(r.lastEventAt, locale) : "-"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
