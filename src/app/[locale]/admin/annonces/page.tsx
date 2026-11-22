import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { currentAdminId } from "@/lib/limelight/admin";
import { prisma } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { AnnouncementForm, ArchiveAnnouncement } from "@/components/admin/announcements";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.announcements")}`, robots: { index: false } };
}

/** Admin > Announcements: product updates shown in the bell (round 8). */
export default async function AnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const t = await getTranslations({ locale, namespace: "app.admin.announcements" });
  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { reads: true } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-fg-muted">{t("lead")}</p>
      </div>
      <AnnouncementForm />
      <table className="w-full text-sm">
        <thead className="text-left text-fg-muted">
          <tr>
            <th className="py-2">{t("colTitle")}</th>
            <th>{t("colAudience")}</th>
            <th>{t("colDate")}</th>
            <th>{t("colReads")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-border align-top">
              <td className="py-2">
                <p className="font-bold">{a.title}</p>
                <p className="text-fg-muted">{a.body}</p>
                {a.link && <p className="text-xs text-accent">{a.link}</p>}
              </td>
              <td>{t(`audiences.${a.audience as "ALL" | "TALENT" | "CASTING"}`)}</td>
              <td>{dateTime(a.createdAt, locale)}</td>
              <td>{a._count.reads}</td>
              <td>{a.archivedAt ? <span className="text-fg-subtle">{t("archived")}</span> : <ArchiveAnnouncement id={a.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
