import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";
import { currentAdminId } from "@/lib/limelight/admin";
import { listAllRoleSearches } from "@/lib/role-search";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.roleSearches")}` };
}

/** Every AI role search, for admins only (performers see their own rows). */
export default async function RoleSearchesAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  if (!(await currentAdminId())) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const tt = await getTranslations({ locale, namespace: "talents" });
  const planNames = (tt.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const PLAN_INDEX: Record<string, number> = { FREE: 0, PRO: 1, PREMIUM: 2, ULTIMATE: 3 };
  const rows = await listAllRoleSearches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.roleSearches.title")}</h1>
        <p className="text-fg-muted">{t("admin.roleSearches.subtitle")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-sedan border border-dashed border-border p-6 text-sm text-fg-muted">
          {t("admin.roleSearches.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sedan border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-fg-muted">
              <tr>
                <th className="p-3 font-medium">{t("admin.roleSearches.columns.when")}</th>
                <th className="p-3 font-medium">{t("admin.roleSearches.columns.who")}</th>
                <th className="p-3 font-medium">{t("admin.roleSearches.columns.plan")}</th>
                <th className="p-3 font-medium">{t("admin.roleSearches.columns.period")}</th>
                <th className="p-3 font-medium">{t("admin.roleSearches.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 whitespace-nowrap">{dateTime(r.createdAt, locale)}</td>
                  <td className="p-3">{r.user.email}</td>
                  <td className="p-3">{planNames[PLAN_INDEX[r.plan] ?? -1] ?? r.plan}</td>
                  <td className="p-3 font-mono">
                    {r.periodKey} #{r.seq}
                  </td>
                  <td className="p-3">
                    <Badge variant={r.status === "queued" ? "accent" : "neutral"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
