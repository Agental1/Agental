import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { confirmationPhrase, deletionDays } from "@/domain/account-deletion";
import { listDeletionCandidates } from "@/lib/admin/account-deletion";
import { deleteEligibleAccountsForm, sendDeletionWarningsForm } from "@/app/actions/admin-deletion";
import { emailSenderConfigured } from "@/lib/mailer";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.cleanup")}`, robots: { index: false } };
}

/**
 * Account cleanup: the accounts eligible for deletion (email never verified,
 * older than N days, never paid, not staff or test), an optional warning
 * email, a CSV export, and "Delete all eligible" behind a typed confirmation.
 * Admins only; each view is logged. Nothing is deleted without the typed
 * phrase, and the rule is checked again per account when it runs.
 */
export default async function CleanupPage({
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
  const days = deletionDays(one("days"), deletionDays(process.env.ACCOUNT_DELETION_AFTER_DAYS));
  const rows = await listDeletionCandidates(days);
  await audit({ actorUserId: adminId, action: "admin.view.deletion", resourceType: "User", resourceId: "*", after: { days, count: rows.length } });
  const phrase = confirmationPhrase(rows.length);
  const field = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";
  const error = one("error");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.cleanup.title")}</h1>
        <p className="max-w-3xl text-fg-muted">{t("admin.cleanup.subtitle", { days })}</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">{t("admin.cleanup.days")}</span>
          <input name="days" type="number" min={1} max={365} defaultValue={days} className={`${field} w-28`} />
        </label>
        <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t("admin.accounts.filter")}</button>
        <a href={`/api/admin/suppression?days=${days}`} className="h-10 content-center px-2 text-sm font-bold text-accent hover:underline">
          {t("admin.cleanup.csv")}
        </a>
      </form>

      {one("warned") !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t("admin.cleanup.warned", { count: Number(one("warned")) || 0 })}
        </p>
      )}
      {one("deleted") !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t("admin.cleanup.deleted", { count: Number(one("deleted")) || 0, failed: Number(one("failed")) || 0 })}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          {t(error === "confirmation" ? "admin.cleanup.badConfirmation" : error === "empty" ? "admin.cleanup.nothing" : "admin.accounts.statusError")}
        </p>
      )}

      <p className="font-bold">{t("admin.cleanup.count", { count: rows.length })}</p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-sedan border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                {(["email", "audience", "created", "status", "warned", "media"] as const).map((c) => (
                  <th key={c} className="p-3 font-medium">{t(`admin.cleanup.cols.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">
                    <Link href={`/admin/comptes/${r.id}`} className="font-bold text-accent hover:underline">{r.email}</Link>
                  </td>
                  <td className="p-3">{r.kind}</td>
                  <td className="whitespace-nowrap p-3">{dateTime(r.createdAt, locale)}</td>
                  <td className="p-3">{t(`admin.accounts.statuses.${r.accountStatus as "UNREVIEWED"}`)}</td>
                  <td className="whitespace-nowrap p-3">{r.warnedAt ? dateTime(r.warnedAt, locale) : "-"}</td>
                  <td className="p-3">{r.mediaCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={sendDeletionWarningsForm} className="space-y-2 rounded-sedan border border-border bg-surface p-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="days" value={days} />
            <h2 className="font-display text-lg font-medium">{t("admin.cleanup.warnTitle")}</h2>
            <p className="text-sm text-fg-muted">{t("admin.cleanup.warnBody", { days })}</p>
            {!emailSenderConfigured() && <p className="text-sm font-bold text-danger">{t("admin.cleanup.noSender")}</p>}
            <button className="h-10 rounded-sedan border border-accent px-4 text-sm font-bold text-accent hover:bg-accent/10">
              {t("admin.cleanup.warnCta")}
            </button>
          </form>

          <form action={deleteEligibleAccountsForm} className="space-y-2 rounded-sedan border border-danger/50 bg-danger/5 p-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="days" value={days} />
            <h2 className="font-display text-lg font-medium text-danger">{t("admin.cleanup.deleteTitle")}</h2>
            <p className="text-sm">{t("admin.cleanup.deleteBody", { count: rows.length })}</p>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("admin.cleanup.typeToConfirm", { phrase })}</span>
              <input name="confirm" required autoComplete="off" className={`${field} max-w-xs`} />
            </label>
            <button className="h-10 rounded-sedan bg-danger px-4 text-sm font-bold text-white">
              {t("admin.cleanup.deleteCta", { count: rows.length })}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
