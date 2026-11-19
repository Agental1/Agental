import { formatPlanPrice } from "@/lib/plan-price";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Gauge } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CastingPlanSelector,
  type CastingPlanCard,
} from "@/components/casting/casting-plan-selector";
import { B2B_PLANS } from "@/domain/pricing";
import { monthlyQuota, activeProjectsQuota } from "@/lib/quotas";
import type { PlanB2B } from "@/domain/enums";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "casting" });
  return { title: t("space.subscription.title") };
}


export default async function CastingAbonnementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: true },
  });
  if (!membership) return null;
  const org = membership.organization;
  const plan = org.plan as PlanB2B;

  const [seatCount, projectsQ, candQ] = await Promise.all([
    prisma.seat.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
    activeProjectsQuota(org.id, plan),
    monthlyQuota(org.id, plan, "filteredCandidatures"),
  ]);

  // Display names come from the messages, in the order of the B2B_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: CastingPlanCard[] = (Object.keys(B2B_PLANS) as PlanB2B[]).map((p, i) => {
    const def = B2B_PLANS[p];
    return {
      plan: p,
      name: planNames[i] ?? p,
      price:
        p === "ENTERPRISE"
          ? t("space.subscription.onQuote")
          : formatPlanPrice(def.priceCents, locale),
      priceUnit:
        p === "ENTERPRISE"
          ? ""
          : def.perSeat
            ? t("space.subscription.perSeatMonth")
            : def.priceCents
              ? t("space.subscription.perMonth")
              : "",
      features: t.raw(`space.planFeatures.${p}`) as string[],
      contactOnly: p === "ENTERPRISE",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.subscription.title")}</h1>
        <p className="text-fg-muted">{t("space.subscription.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaCard
          label={t("space.subscription.activeProjects")}
          used={projectsQ.used}
          limit={projectsQ.limit}
        />
        <QuotaCard
          label={t("space.subscription.sortedThisMonth")}
          used={candQ.used}
          limit={candQ.limit}
        />
      </div>

      <CastingPlanSelector plans={plans} current={plan} seatCount={Math.max(1, seatCount)} />
    </div>
  );
}

function QuotaCard({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const near = limit != null && used / limit >= 0.8;
  return (
    <div className="rounded-sedan border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Gauge className="size-4" /> {label}
        </span>
        <span className="text-sm font-medium">
          {used}
          {limit != null ? ` / ${limit}` : " / ∞"}
        </span>
      </div>
      {limit != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${near ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
