import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { listDeleted, purgeDeletedAccounts } from "@/lib/admin/account-removal";
import { daysLeft, RESTORE_DAYS } from "@/domain/account-removal";
import { restoreAccountForm } from "@/app/actions/admin-removal";
import { Table } from "@/components/admin/view-parts";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.cleanup")}`, robots: { index: false } };
}

/**
 * Round 9, group 1: Admin > Deleted. The accounts deleted from Admin >
 * Accounts, each restorable for 30 days. Opening the page also purges the
 * ones past 30 days (with their files), so the purge happens even without the
 * daily cron. Admins only; each view is logged.
 */
export default async function DeletedPage({
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
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  // A small batch here (the page must stay fast); the daily cron does the rest.
  await purgeDeletedAccounts(new Date(), adminId, 20).catch((e) => console.error("[account-removal] purge failed", e instanceof Error ? e.name : "error"));
  const all = await listDeleted();
  const q = one("q")?.trim().toLowerCase().slice(0, 100) ?? "";
  const rows = q ? all.filter((r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : all;
  await audit({ actorUserId: adminId, action: "admin.view.deleted", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  const now = new Date();
  const d = "admin.deleted" as const;
  const field = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${d}.title`)}</h1>
        <p className="max-w-3xl text-fg-muted">{t(`${d}.subtitle`, { days: RESTORE_DAYS })}</p>
      </div>

      {one("restored") && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t(`${d}.restored`)}
        </p>
      )}
      {one("restoreError") && (
        <p role="alert" className="rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          {t(`${d}.restoreError`)}
        </p>
      )}

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold">
          {t("admin.accounts.search")}
          <input name="q" type="search" defaultValue={q} className={`${field} min-w-64`} />
        </label>
        <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t("admin.accounts.filter")}</button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border p-8 text-center">
          <p className="font-bold">{t(`${d}.empty`)}</p>
          <p className="mt-1 text-sm text-fg-muted">
            {t(`${d}.emptyHint`)}{" "}
            <Link href="/admin/comptes" className="font-bold text-accent hover:underline">
              {t("admin.nav.accounts")}
            </Link>
          </p>
        </div>
      ) : (
        <Table head={[t(`${d}.cols.account`), t(`${d}.cols.audience`), t(`${d}.cols.deletedAt`), t(`${d}.cols.deletedBy`), t(`${d}.cols.purgeOn`), ""]} minWidth={860}>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-3">
                <p className="font-bold">{r.name || r.email}</p>
                {r.name && <p className="text-xs text-fg-muted">{r.email}</p>}
              </td>
              <td className="p-3">{r.kind === "CASTING" ? t("admin.accounts.totals.casting") : t("admin.accounts.totals.performers")}</td>
              <td className="whitespace-nowrap p-3">{dateTime(r.deletedAt, locale)}</td>
              <td className="p-3">{r.deletedBy ?? "-"}</td>
              <td className="whitespace-nowrap p-3">
                {dateTime(r.purgeOn, locale)}
                <p className="text-xs text-fg-muted">{t(`${d}.daysLeft`, { count: daysLeft(r.deletedAt, now) })}</p>
              </td>
              <td className="p-3 text-right">
                <form action={restoreAccountForm}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={r.id} />
                  <button className="h-9 rounded-sedan border border-accent px-3 text-sm font-bold text-accent hover:bg-accent/10">
                    {t(`${d}.restore`)}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
