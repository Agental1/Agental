import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountFiltersFrom, listAccounts, signupTotals } from "@/lib/admin/accounts";
import { ACCOUNT_STATUSES, workflowMode } from "@/domain/workflow/eligibility";
import { setAccountStatusForm } from "@/app/actions/admin-accounts";
import { SelectAll } from "@/components/admin/select-all";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.accounts")}`, robots: { index: false } };
}

const PAGE_SIZE = 100;

const STATUS_VARIANT = {
  UNREVIEWED: "warning",
  APPROVED: "success",
  TEST: "accent",
  STAFF: "neutral",
  SPAM: "danger",
} as const;

/**
 * Every account, with the signup totals, filters, CSV export and the review
 * status staff set one by one or in bulk. Admins only (checked here and in the
 * action); each view is logged.
 */
export default async function AccountsPage({
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
  const f = accountFiltersFrom(one);
  const [rows, totals] = await Promise.all([listAccounts(f), signupTotals()]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  await audit({ actorUserId: adminId, action: "admin.view.accounts", resourceType: "User", resourceId: "*", after: { count: rows.length, page } });

  const filterQs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const csv = filterQs.toString();
  const pageHref = (p: number) => {
    const q = new URLSearchParams(filterQs);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/admin/comptes${s ? `?${s}` : ""}`;
  };
  const updated = one("updated");
  const statusError = one("statusError");
  const select = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";
  const mode = workflowMode();

  const cards = [
    { label: t("admin.accounts.totals.performers"), value: totals.performers.total, sub: t("admin.accounts.totals.split", totals.performers) },
    { label: t("admin.accounts.totals.casting"), value: totals.casting.total, sub: t("admin.accounts.totals.split", totals.casting) },
    { label: t("admin.accounts.totals.staff"), value: totals.staff },
    { label: t("admin.accounts.totals.test"), value: totals.test },
    { label: t("admin.accounts.totals.spam"), value: totals.spam },
    { label: t("admin.accounts.totals.all"), value: totals.all },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.accounts.title")}</h1>
        <p className="text-fg-muted">{t("admin.accounts.subtitle", { count: rows.length })}</p>
      </div>

      <section aria-labelledby="signups" className="space-y-2">
        <h2 id="signups" className="font-display text-lg font-medium">
          {t("admin.accounts.totals.title")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <div key={c.label} className="rounded-sedan border border-border bg-surface p-4">
              <p className="font-display text-2xl tabular-nums">{c.value}</p>
              <p className="text-xs font-bold">{c.label}</p>
              {c.sub && <p className="text-xs text-fg-muted">{c.sub}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-fg-muted">{t("admin.accounts.totals.note")}</p>
        <p className="text-sm font-bold">{t(`admin.accounts.mode.${mode}`)}</p>
      </section>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <input name="q" defaultValue={f.q} placeholder={t("admin.accounts.search")} aria-label={t("admin.accounts.search")} className={`${select} min-w-56`} />
        <select name="audience" defaultValue={f.audience ?? ""} className={select} aria-label={t("admin.accounts.cols.audience")}>
          <option value="">{t("admin.accounts.cols.audience")}: {t("admin.accounts.all")}</option>
          <option value="TALENT">TALENT</option>
          <option value="CASTING">CASTING</option>
        </select>
        <select name="status" defaultValue={f.status ?? ""} className={select} aria-label={t("admin.accounts.cols.status")}>
          <option value="">{t("admin.accounts.cols.status")}: {t("admin.accounts.all")}</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.accounts.statuses.${s}`)}
            </option>
          ))}
        </select>
        <select name="agents" defaultValue={f.agents ?? ""} className={select} aria-label={t("admin.accounts.cols.agents")}>
          <option value="">{t("admin.accounts.cols.agents")}: {t("admin.accounts.all")}</option>
          <option value="yes">{t("admin.accounts.yes")}</option>
          <option value="no">{t("admin.accounts.no")}</option>
        </select>
        <select name="plan" defaultValue={f.plan ?? ""} className={select} aria-label={t("admin.accounts.cols.plan")}>
          <option value="">{t("admin.accounts.cols.plan")}: {t("admin.accounts.all")}</option>
          {["FREE", "PRO", "PREMIUM", "ULTIMATE"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select name="method" defaultValue={f.method ?? ""} className={select} aria-label={t("admin.accounts.cols.method")}>
          <option value="">{t("admin.accounts.cols.method")}: {t("admin.accounts.all")}</option>
          <option value="email">email</option>
          <option value="google">google</option>
        </select>
        <select name="verified" defaultValue={f.verified ?? ""} className={select} aria-label={t("admin.accounts.cols.verified")}>
          <option value="">{t("admin.accounts.cols.verified")}: {t("admin.accounts.all")}</option>
          <option value="yes">{t("admin.accounts.yes")}</option>
          <option value="no">{t("admin.accounts.no")}</option>
        </select>
        <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t("admin.accounts.filter")}</button>
        <a href={`/api/admin/comptes${csv ? `?${csv}` : ""}`} className="h-10 content-center px-2 text-sm font-bold text-accent hover:underline">
          {t("admin.accounts.csv")}
        </a>
      </form>

      {updated !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t("admin.accounts.updated", { count: Number(updated) || 0 })}
        </p>
      )}
      {statusError && (
        <p role="alert" className="rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          {t("admin.accounts.statusError")}
        </p>
      )}

      <form action={setAccountStatusForm} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="back" value={pageHref(page)} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t("admin.accounts.setStatus")}</span>
            <select name="status" required defaultValue="" className={select} aria-label={t("admin.accounts.setStatus")}>
              <option value="" disabled>
                {t("admin.accounts.cols.status")}
              </option>
              {ACCOUNT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.accounts.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-sedan border border-accent px-4 text-sm font-bold text-accent hover:bg-accent/10">
            {t("admin.accounts.apply")}
          </button>
        </div>

        <div className="overflow-x-auto rounded-sedan border border-border">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-surface-2 text-left text-fg-muted">
              <tr>
                <th className="p-3">
                  <SelectAll label={t("admin.accounts.selectAll")} />
                </th>
                {(["name", "email", "audience", "created", "method", "verified", "status", "agents", "plan", "completeness", "media", "website"] as const).map((c) => (
                  <th key={c} className="p-3 font-medium" title={c === "agents" ? t("admin.accounts.agentsHelp") : undefined}>
                    {t(`admin.accounts.cols.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">
                    <input type="checkbox" name="id" value={r.id} aria-label={t("admin.accounts.select", { name: r.name || r.email })} className="size-4 accent-[var(--accent)]" />
                  </td>
                  <td className="p-3">
                    <Link href={`/admin/comptes/${r.id}`} className="font-bold text-accent hover:underline">
                      {r.name || "-"}
                    </Link>
                  </td>
                  <td className="p-3">{r.email}</td>
                  <td className="p-3">{r.audience === "CASTING" ? t("admin.accounts.totals.casting") : t("admin.accounts.totals.performers")}</td>
                  <td className="whitespace-nowrap p-3">{dateTime(r.createdAt, locale)}</td>
                  <td className="p-3">{r.method}</td>
                  <td className="p-3">{r.emailVerified ? t("admin.accounts.yes") : t("admin.accounts.no")}</td>
                  <td className="whitespace-nowrap p-3">
                    <Badge variant={STATUS_VARIANT[r.status]}>{t(`admin.accounts.statuses.${r.status}`)}</Badge>
                    {r.isAdmin && <span className="ml-1 text-xs text-fg-muted">{t("admin.accounts.admin")}</span>}
                  </td>
                  <td className="p-3 font-bold">{r.agentsEnabled ? t("admin.accounts.yes") : <span className="font-normal text-fg-muted">{t("admin.accounts.no")}</span>}</td>
                  <td className="p-3">{r.plan || "-"}</td>
                  <td className="p-3">{r.completeness === null ? "-" : `${r.completeness}%`}</td>
                  <td className="p-3">{r.mediaCount}</td>
                  <td className="p-3">{t(`admin.accounts.site.${r.website}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>

      {pages > 1 && (
        <nav className="flex items-center gap-4 text-sm" aria-label={t("admin.accounts.page", { page, pages })}>
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="font-bold text-accent hover:underline">
              {t("admin.accounts.prev")}
            </Link>
          )}
          <span className="text-fg-muted">{t("admin.accounts.page", { page, pages })}</span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="font-bold text-accent hover:underline">
              {t("admin.accounts.next")}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
