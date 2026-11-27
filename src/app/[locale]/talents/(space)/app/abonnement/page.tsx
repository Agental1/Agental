import { talentPlanCards } from "@/lib/plan-cards";
import { PromotionsButton, PromotionsProvider } from "@/components/talents/promotions";
import { BillingPeriodProvider } from "@/components/talents/billing-period";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { getRoleSearchQuota } from "@/lib/role-search";
import { SearchUsageBar } from "@/components/app/search-usage";
import { date } from "@/lib/format";
import { PlanSelector, type PlanCard } from "@/components/talents/plan-selector";
import { LimelightSection } from "@/components/talents/limelight-section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.subscription.title") };
}


export default async function AbonnementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  /** ?need=redo opens the Limelight form on "Redo my website" (dashboard card). */
  searchParams: Promise<{ need?: string }>;
}) {
  const { need } = await searchParams;
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const effective = await getTalentPlan(session.user.id);
  const usage = await getRoleSearchQuota(session.user.id);

  const current = effective.plan;
  // Round 8b: "USC student verified" shows in the checkout panel.
  const uscRow = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { uscVerifiedAt: true, uscVerifiedEmail: true },
  });
  const usc =
    uscRow?.uscVerifiedAt && uscRow.uscVerifiedEmail
      ? { at: uscRow.uscVerifiedAt.toISOString(), email: uscRow.uscVerifiedEmail }
      : null;

  const plans: PlanCard[] = talentPlanCards(t, locale);

  return (
    <PromotionsProvider>
    <BillingPeriodProvider>
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.subscription.title")}</h1>
        <p className="text-fg-muted">{t("space.subscription.subtitle")}</p>
        {effective.proUntil && (
          <p className="mt-2 text-[15px] font-bold text-accent">
            {t("limelight.app.proUntil", { date: date(effective.proUntil, locale) })}
          </p>
        )}
      </div>

      <section className="max-w-md rounded-sedan-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-[15px] font-bold">{t("space.dashboard.findRoles.usage")}</h2>
        <SearchUsageBar quota={usage} />
      </section>

      <div className="space-y-3">
        <PromotionsButton accountEmail={session.user.email} />
        <PlanSelector plans={plans} current={current} usc={usc} />
      </div>


      <LimelightSection
        userId={session.user.id}
        email={session.user.email ?? ""}
        locale={locale}
        defaultNeed={need === "redo" ? "redo" : undefined}
      />

    </div>
    </BillingPeriodProvider>
    </PromotionsProvider>
  );
}
