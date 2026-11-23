import { currentAdminId } from "@/lib/limelight/admin";
import { notFound } from "next/navigation";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang — ${t("admin.nav.minors")}` };
}

// Stored code -> message key under `admin.minors`. The columns are plain
// String columns, so an unknown code falls back to the raw value.
const STATE_KEY = {
  OPENED: "open",
  DOCS_PENDING: "waiting",
  READY: "ready",
  BLOCKED: "blocked",
} as const;
const AUTH_CODES = ["NONE", "REQUESTED", "GRANTED", "REFUSED"] as const;
const ESCROW_CODES = ["PENDING", "HELD", "RELEASED"] as const;

function oneOf<T extends string>(codes: readonly T[], value: string): T | null {
  return (codes as readonly string[]).includes(value) ? (value as T) : null;
}

export default async function AdminMinorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Round 8d: each admin page checks the admin role itself (the layout's check
  // alone does not cover a page's own data loading).
  if (!(await currentAdminId())) notFound();
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });

  const cases = await prisma.minorCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { artistProfile: true, project: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.minors.title")}</h1>
        <p className="text-fg-muted">{t("admin.minors.subtitle")}</p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-10 text-center">
          <ShieldCheck className="mx-auto size-8 text-success" />
          <p className="mt-3 text-sm text-fg-muted">{t("admin.minors.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-sedan border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("admin.minors.talent")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.minors.project")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.minors.prefectoral")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.minors.escrow")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.minors.parental")}</th>
                <th className="px-4 py-3 font-medium">{t("admin.minors.state")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cases.map((c) => {
                const authCode = oneOf(AUTH_CODES, c.prefectoralAuthStatus);
                const escrowCode = oneOf(ESCROW_CODES, c.escrowStatus);
                const stateCode = oneOf(
                  Object.keys(STATE_KEY) as (keyof typeof STATE_KEY)[],
                  c.state
                );
                return (
                  <tr key={c.id} className="bg-surface">
                    <td className="px-4 py-2.5 font-medium">
                      {c.artistProfile.stageName}
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {c.project?.title ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={c.prefectoralAuthStatus === "GRANTED" ? "success" : "warning"}>
                        {authCode
                          ? t(`admin.minors.auth.${authCode}`)
                          : c.prefectoralAuthStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={c.escrowStatus === "HELD" ? "success" : "warning"}>
                        {c.escrowPercent}% ·{" "}
                        {escrowCode
                          ? t(`admin.minors.escrowStatus.${escrowCode}`)
                          : c.escrowStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={c.parentalPresence ? "success" : "warning"}>
                        {c.parentalPresence
                          ? t("admin.minors.confirmed")
                          : t("admin.minors.toConfirm")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={c.state === "READY" ? "success" : "neutral"}>
                        {stateCode ? t(`admin.minors.${STATE_KEY[stateCode]}`) : c.state}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
