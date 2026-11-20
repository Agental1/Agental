import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { currentAdminId } from "@/lib/limelight/admin";
import { audit } from "@/lib/audit";
import { listAccounts, type AccountFilters } from "@/lib/admin/accounts";
import { dateTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.accounts")}`, robots: { index: false } };
}

function filtersFrom(sp: Record<string, string | string[] | undefined>): AccountFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const audience = one("audience");
  const method = one("method");
  const verified = one("verified");
  return {
    q: one("q")?.slice(0, 100),
    audience: audience === "TALENT" || audience === "CASTING" ? audience : undefined,
    plan: ["FREE", "PRO", "PREMIUM", "ULTIMATE"].includes(one("plan") ?? "") ? one("plan") : undefined,
    method: method === "email" || method === "google" ? method : undefined,
    verified: verified === "yes" || verified === "no" ? verified : undefined,
  };
}

/** Every account, filterable, with a CSV export. Admins only; each view is logged. */
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
  const f = filtersFrom(await searchParams);
  const rows = await listAccounts(f);
  await audit({ actorUserId: adminId, action: "admin.view.accounts", resourceType: "User", resourceId: "*", after: { count: rows.length } });
  const csv = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const select = "h-10 rounded-sedan border border-border bg-surface px-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.accounts.title")}</h1>
        <p className="text-fg-muted">{t("admin.accounts.subtitle", { count: rows.length })}</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <input name="q" defaultValue={f.q} placeholder={t("admin.accounts.search")} className={`${select} min-w-56`} />
        <select name="audience" defaultValue={f.audience ?? ""} className={select} aria-label={t("admin.accounts.cols.audience")}>
          <option value="">{t("admin.accounts.all")}</option>
          <option value="TALENT">TALENT</option>
          <option value="CASTING">CASTING</option>
        </select>
        <select name="plan" defaultValue={f.plan ?? ""} className={select} aria-label={t("admin.accounts.cols.plan")}>
          <option value="">{t("admin.accounts.all")}</option>
          {["FREE", "PRO", "PREMIUM", "ULTIMATE"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select name="method" defaultValue={f.method ?? ""} className={select} aria-label={t("admin.accounts.cols.method")}>
          <option value="">{t("admin.accounts.all")}</option>
          <option value="email">email</option>
          <option value="google">google</option>
        </select>
        <select name="verified" defaultValue={f.verified ?? ""} className={select} aria-label={t("admin.accounts.cols.verified")}>
          <option value="">{t("admin.accounts.all")}</option>
          <option value="yes">{t("admin.accounts.yes")}</option>
          <option value="no">{t("admin.accounts.no")}</option>
        </select>
        <button className="h-10 rounded-sedan bg-accent px-4 text-sm font-bold text-[var(--accent-fg)]">{t("admin.accounts.filter")}</button>
        <a href={`/api/admin/comptes${csv ? `?${csv}` : ""}`} className="h-10 content-center px-2 text-sm font-bold text-accent hover:underline">
          {t("admin.accounts.csv")}
        </a>
      </form>
      <div className="overflow-x-auto rounded-sedan border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface-2 text-left text-fg-muted">
            <tr>
              {(["name", "email", "audience", "plan", "created", "method", "verified", "completeness", "media", "website"] as const).map((c) => (
                <th key={c} className="p-3 font-medium">
                  {t(`admin.accounts.cols.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/admin/comptes/${r.id}`} className="font-bold text-accent hover:underline">
                    {r.name || "-"}
                  </Link>
                </td>
                <td className="p-3">{r.email}</td>
                <td className="p-3">{r.audience}</td>
                <td className="p-3">{r.plan || "-"}</td>
                <td className="p-3 whitespace-nowrap">{dateTime(r.createdAt, locale)}</td>
                <td className="p-3">{r.method}</td>
                <td className="p-3">{r.emailVerified ? t("admin.accounts.yes") : t("admin.accounts.no")}</td>
                <td className="p-3">{r.completeness === null ? "-" : `${r.completeness}%`}</td>
                <td className="p-3">{r.mediaCount}</td>
                <td className="p-3">{t(`admin.accounts.site.${r.website}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
