import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountTimeline } from "@/lib/admin/accounts";
import { dateTime } from "@/lib/format";

/** One account's timeline. Media open through the private media route (signed link). */
export default async function AccountPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  const locale = toLocale(raw);
  setRequestLocale(locale);
  const adminId = await currentAdminId();
  if (!adminId) notFound();
  const data = await accountTimeline(id);
  if (!data) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  await audit({ actorUserId: adminId, action: "admin.view.account", resourceType: "User", resourceId: id });
  const { user, events } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/comptes" className="text-sm font-bold text-accent hover:underline">
        {t("admin.accounts.back")}
      </Link>
      <div>
        <h1 className="font-display text-3xl font-medium">{user.artistProfile?.stageName || user.name || user.email}</h1>
        <p className="text-fg-muted">
          {user.email} · {user.kind}
          {user.artistProfile ? ` · ${user.artistProfile.completenessScore}%` : ""}
        </p>
      </div>
      <h2 className="font-display text-xl font-medium">{t("admin.accounts.timeline")}</h2>
      <ol className="space-y-2">
        {events.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-3 rounded-sedan border border-border bg-surface p-3 text-sm">
            <span className="w-40 shrink-0 text-fg-muted">{dateTime(e.at, locale)}</span>
            <span className="font-bold">{t(`admin.accounts.events.${e.kind}`)}</span>
            {e.detail && <span className="text-fg-muted">{e.detail}</span>}
            {e.mediaId && (
              <a href={`/api/media/${e.mediaId}`} target="_blank" rel="noreferrer" className="font-bold text-accent hover:underline">
                {t("admin.accounts.open")}
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
