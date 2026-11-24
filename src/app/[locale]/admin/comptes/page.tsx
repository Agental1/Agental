import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { accountCounts, accountFiltersFrom, listAccounts, type AccountGroup, type AccountRow } from "@/lib/admin/accounts";
import { workflowMode } from "@/domain/workflow/eligibility";
import { CountCard } from "@/components/admin/count-card";
import { setAccountStatusForm } from "@/app/actions/admin-accounts";
import { SelectAll } from "@/components/admin/select-all";
import { BulkBar } from "@/components/admin/bulk-bar";
import { SortHeader } from "@/components/admin/sort-header";
import { deleteAccountsForm, warnAccountsForm } from "@/app/actions/admin-removal";
import { Badge } from "@/components/ui/badge";
import { adminDateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.accounts")}`, robots: { index: false } };
}

const PAGE_SIZE = 100;

/** Round 10: what staff can mark, in the order of the select. */
const MARKS = ["TEST", "UNREVIEWED", "staff:on", "staff:off", "REVOKED", "SPAM"] as const;

/**
 * Every account, with the signup totals, filters, CSV export, the review
 * status staff set one by one or in bulk, and (round 9) the cleanup: tick
 * rows, then "Send warning email" or "Delete" (restorable for 30 days in
 * Admin > Deleted). Staff, test, admin and paying accounts can never be
 * deleted. Admins only (checked here and in the actions); each view is logged.
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
  const [rows, counts] = await Promise.all([listAccounts(f), accountCounts()]);
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

  const c4 = "admin.accounts.counts" as const;
  const cards: { key: string; value: number; group?: AccountGroup; href?: string }[] = [
    { key: "accounts", value: counts.accounts },
    { key: "performers", value: counts.performers, group: "performers" },
    { key: "casting", value: counts.casting, group: "casting" },
    { key: "staff", value: counts.staff, group: "staff" },
    { key: "test", value: counts.test, group: "test" },
    { key: "deleted", value: counts.deleted, href: "/admin/suppression" },
  ];
  const a = "admin.accounts" as const;
  const removed = one("removed");
  const warned = one("warned");
  const skipped = Number(one("skipped")) || 0;
  const bulkError = one("bulkError");
  const filtered = filterQs.toString().replace(/(^|&)(sort|dir)=[^&]*/g, "") !== "";
  const sortQuery = new URLSearchParams(filterQs);
  const cols = (c: string) => t(`${a}.cols.${c}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t(`${a}.title`)}</h1>
        <p className="text-fg-muted">{t(`${a}.subtitle`, { count: rows.length })}</p>
      </div>

      <section aria-labelledby="signups" className="space-y-2">
        <h2 id="signups" className="font-display text-lg font-medium">
          {t(`${a}.totals.title`)}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <CountCard
              key={c.key}
              label={t(`${c4}.${c.key}.label`)}
              help={t(`${c4}.${c.key}.help`)}
              value={c.value}
              href={c.href ?? (c.group ? `/admin/comptes?group=${c.group}` : "/admin/comptes")}
              active={c.href ? false : c.group ? f.group === c.group : !filtered}
            />
          ))}
        </div>
        <p className="text-xs text-fg-muted">{t(`${c4}.note`)}</p>
        <p className="text-sm font-bold">{t(`${a}.mode.${mode}`)}</p>
      </section>

      <form className="space-y-3 rounded-sedan border border-border bg-surface p-4" method="get">
        {f.sort && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir && <input type="hidden" name="dir" value={f.dir} />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs font-bold sm:col-span-2">
            {t(`${a}.search`)}
            <input name="q" type="search" defaultValue={f.q} className={select} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${a}.filters.group`)}
            <select name="group" defaultValue={f.group ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              {(["performers", "casting", "staff", "test", "blocked"] as const).map((g) => (
                <option key={g} value={g}>
                  {t(`${a}.groups.${g}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("verified")}
            <select name="verified" defaultValue={f.verified ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="yes">{t(`${a}.verifiedYes`)}</option>
              <option value="no">{t(`${a}.notVerified`)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("method")}
            <select name="method" defaultValue={f.method ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="email">{t(`${a}.methods.email`)}</option>
              <option value="google">{t(`${a}.methods.google`)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${a}.filters.createdBefore`)}
            <input type="date" name="createdBefore" defaultValue={f.createdBefore} className={select} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${a}.filters.paid`)}
            <select name="neverPaid" defaultValue={f.neverPaid ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="yes">{t(`${a}.filters.neverPaid`)}</option>
              <option value="no">{t(`${a}.filters.paidOrTeam`)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("lastSignIn")}
            <select name="lastSignIn" defaultValue={f.lastSignIn ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="never">{t(`${a}.filters.signInNever`)}</option>
              <option value="before">{t(`${a}.filters.signInBefore`)}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("privacy")}
            <select name="privacy" defaultValue={f.privacy ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="yes">{t("admin.cookies.privacyYes")}</option>
              <option value="no">{t("admin.cookies.privacyNo")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {t(`${a}.filters.signedInBefore`)}
            <input type="date" name="signedInBefore" defaultValue={f.signedInBefore} className={select} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("plan")}
            <select name="plan" defaultValue={f.plan ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              {["FREE", "PRO", "PREMIUM", "ULTIMATE"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            {cols("audience")}
            <select name="audience" defaultValue={f.audience ?? ""} className={select}>
              <option value="">{t(`${a}.all`)}</option>
              <option value="TALENT">{t(`${a}.totals.performers`)}</option>
              <option value="CASTING">{t(`${a}.totals.casting`)}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t(`${a}.filter`)}</button>
          {filtered && (
            <Link href="/admin/comptes" className="text-sm font-bold text-accent hover:underline">
              {t(`${a}.clear`)}
            </Link>
          )}
          <a href={`/api/admin/comptes${csv ? `?${csv}` : ""}`} className="ml-auto text-sm font-bold text-accent hover:underline">
            {t(`${a}.csv`)}
          </a>
        </div>
      </form>

      {updated !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t(`${a}.updated`, { count: Number(updated) || 0 })}
        </p>
      )}
      {removed !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t(`${a}.bulk.removed`, { count: Number(removed) || 0 })} {skipped > 0 && t(`${a}.bulk.skipped`, { count: skipped })}{" "}
          <Link href="/admin/suppression" className="font-bold text-accent hover:underline">
            {t(`${a}.bulk.openDeleted`)}
          </Link>
        </p>
      )}
      {warned !== undefined && (
        <p role="status" className="rounded-sedan border border-success/40 bg-success/5 px-4 py-3 text-sm">
          {t(`${a}.bulk.warned`, { count: Number(warned) || 0 })} {skipped > 0 && t(`${a}.bulk.skipped`, { count: skipped })}
        </p>
      )}
      {(statusError || bulkError) && (
        <p role="alert" className="rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          {bulkError === "no_sender" ? t(`${a}.bulk.noSender`) : bulkError === "too_many" ? t(`${a}.bulk.tooMany`) : t(`${a}.statusError`)}
        </p>
      )}

      <form action={setAccountStatusForm} className="space-y-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="back" value={pageHref(page)} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">{t(`${a}.setStatus`)}</span>
            <select name="status" defaultValue="" className={select} aria-label={t(`${a}.setStatus`)}>
              <option value="" disabled>
                {t(`${a}.marks.choose`)}
              </option>
              {MARKS.map((m) => (
                <option key={m} value={m}>
                  {t(`${a}.marks.${m.replace(":", "_")}`)}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-sedan border border-accent px-4 text-sm font-bold text-accent hover:bg-accent/10">
            {t(`${a}.apply`)}
          </button>
          <p className="max-w-xl text-xs text-fg-muted">{t(`${a}.exceptionsNote`)}</p>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-sedan border border-dashed border-border p-8 text-center">
            <p className="font-bold">{t(`${a}.empty`)}</p>
            <p className="mt-1 text-sm text-fg-muted">{t(`${a}.emptyHint`)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sedan border border-border">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="bg-surface-2 text-left text-fg-muted">
                <tr>
                  <th className="w-10 p-3">
                    <SelectAll label={t(`${a}.selectAll`)} />
                  </th>
                  <SortHeader label={cols("name")} column="name" base="/admin/comptes" query={sortQuery} current={f.sort} dir={f.dir} />
                  <th className="p-3 font-medium">{cols("type")}</th>
                  <th className="p-3 font-medium">{cols("verified")}</th>
                  <SortHeader label={cols("completeness")} column="completeness" base="/admin/comptes" query={sortQuery} current={f.sort} dir={f.dir} />
                  <th className="p-3 font-medium" title={t(`${a}.canSearchHelp`)}>{cols("canSearch")}</th>
                  <th className="p-3 font-medium">{cols("searchesUsed")}</th>
                  <SortHeader label={cols("created")} column="created" base="/admin/comptes" query={sortQuery} current={f.sort} dir={f.dir} />
                  <SortHeader label={cols("lastSignIn")} column="lastSignIn" base="/admin/comptes" query={sortQuery} current={f.sort} dir={f.dir} title={t(`${a}.lastSignInHelp`)} />
                  <th className="p-3 font-medium">{cols("cookies")}</th>
                  <th className="p-3 font-medium">{cols("privacy")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        name="id"
                        value={r.id}
                        data-block={r.block ?? ""}
                        data-warn={r.method === "email" && !r.emailVerified ? "1" : "0"}
                        aria-label={t(`${a}.select`, { name: r.name || r.email })}
                        className="size-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="p-3">
                      <Link href={`/admin/comptes/${r.id}`} className="font-bold text-accent hover:underline">
                        {r.name || r.email}
                      </Link>
                      {r.name && <p className="text-xs text-fg-muted">{r.email}</p>}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {t(`${a}.types.${r.type}`)}
                      {r.isTest && (
                        <Badge variant="accent" className="ml-1.5">
                          {t(`${a}.testBadge`)}
                        </Badge>
                      )}
                      {r.block && (
                        <p className="mt-1 text-xs text-fg-muted" title={t(`${a}.bulk.protectedHelp`)}>
                          {t(`${a}.bulk.protected.${r.block}`)}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {r.verifiedAt === null ? (
                        <span className="text-danger">{t(`${a}.no`)}</span>
                      ) : r.verifiedAt.getTime() === 0 ? (
                        t(`${a}.verifiedGoogle`)
                      ) : (
                        t(`${a}.verifiedOn`, { date: adminDateTime(r.verifiedAt, locale) })
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{r.completeness === null ? "-" : `${r.completeness}%`}</td>
                    <td className="p-3">
                      <CanSearch value={r.canSearch} t={(k, v) => t(`${a}.can.${k}`, v)} />
                    </td>
                    <td className="p-3 tabular-nums">{r.audience === "TALENT" ? r.searchesUsed : "-"}</td>
                    <td className="whitespace-nowrap p-3">{adminDateTime(r.createdAt, locale)}</td>
                    <td className="whitespace-nowrap p-3">
                      {r.lastSignInAt ? adminDateTime(r.lastSignInAt, locale) : <span className="text-fg-muted">{t(`${a}.notRecorded`)}</span>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs">{t(`admin.cookies.choices.${r.consent.choice}`)}</td>
                    <td className="whitespace-nowrap p-3 text-xs">
                      {r.privacy.at ? (
                        t("admin.cookies.privacyAccepted", { date: adminDateTime(r.privacy.at, locale), version: r.privacy.version ?? "-" })
                      ) : (
                        <span className="text-fg-muted">{t("admin.cookies.privacyNo")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <BulkBar deleteAction={deleteAccountsForm} warnAction={warnAccountsForm} />
      </form>

      {pages > 1 && (
        <nav className="flex items-center gap-4 text-sm" aria-label={t(`${a}.page`, { page, pages })}>
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="font-bold text-accent hover:underline">
              {t(`${a}.prev`)}
            </Link>
          )}
          <span className="text-fg-muted">{t(`${a}.page`, { page, pages })}</span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="font-bold text-accent hover:underline">
              {t(`${a}.next`)}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** "Can search: Yes" or "No: <reason>", the same reasons the performer sees. */
function CanSearch({ value, t }: { value: AccountRow["canSearch"]; t: (key: string, values?: Record<string, string | number>) => string }) {
  if (value === "n/a") return <span className="text-xs text-fg-muted">{t("notPerformer")}</span>;
  if (value === null) return <span className="font-bold text-success">{t("yes")}</span>;
  return (
    <span className="text-xs">
      <span className="font-bold text-danger">{t("no")}</span> {t(`reasons.${value.reason}`)}
    </span>
  );
}
