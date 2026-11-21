import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import { currentAdminId } from "@/lib/limelight/admin";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = await getTranslations({ locale: toLocale((await params).locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.revenue")}`, robots: { index: false } };
}

/**
 * Revenue (round 7, A5). No live payment source is verified yet (Stripe is
 * not connected, see docs/DECISIONS.md "Payments"), so the page says
 * "Unavailable" and sums nothing. Mock orders are never revenue: they are
 * only counted, apart, so staff know they exist.
 */
export default async function RevenuePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  if (!(await currentAdminId())) notFound();
  const t = await getTranslations({ locale, namespace: "app" });
  const mockOrders = await prisma.siteOrder.count({ where: { provider: "mock" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.revenue.title")}</h1>
        <p className="text-fg-muted">{t("admin.revenue.subtitle")}</p>
      </div>
      <div className="rounded-sedan border border-border bg-surface p-6">
        <p className="font-display text-3xl">{t("admin.revenue.unavailable")}</p>
        <p className="mt-2 text-sm text-fg-muted">{t("admin.revenue.why")}</p>
      </div>
      <p className="text-sm text-fg-muted">{t("admin.revenue.mock", { count: mockOrders })}</p>
    </div>
  );
}
