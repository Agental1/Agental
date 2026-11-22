import { percent } from "@/lib/format";
import { formatPlanPrice, planFeatureLines } from "@/lib/plan-price";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { getRoleSearchQuota } from "@/lib/role-search";
import { SearchUsageBar } from "@/components/app/search-usage";
import { date } from "@/lib/format";
import { PlanSelector, type PlanCard } from "@/components/talents/plan-selector";
import { B2C_PLANS } from "@/domain/pricing";
import { prisma } from "@/lib/db";
import { StudentEmailCard } from "@/components/talents/student-email";
import { STUDENT_DISCOUNT } from "@/domain/student";
import type { PlanB2C } from "@/domain/enums";
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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const effective = await getTalentPlan(session.user.id);
  const usage = await getRoleSearchQuota(session.user.id);

  const current = effective.plan;
  const student = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { studentEmail: true, studentVerifiedAt: true },
  });

  // Display names come from the messages, in the order of the B2C_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: PlanCard[] = (Object.keys(B2C_PLANS) as PlanB2C[]).map((p, i) => ({
    plan: p,
    name: planNames[i] ?? p,
    price: formatPlanPrice(B2C_PLANS[p].priceCents, locale),
    commission: percent(B2C_PLANS[p].commissionRate, locale),
    // space.planFeatures, not a local map. The map that used to live here
    // still advertised "Auto-candidature IA" and daily quotas — the promises
    // the pricing-copy pass removed from the message files. It was rewritten
    // there and never wired up, so the subscription screen kept selling them.
    features: planFeatureLines(t.raw(`space.planFeatures.${p}`) as string[], locale, p),
  }));

  return (
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

      <PlanSelector plans={plans} current={current} />

      <StudentEmailCard
        verifiedEmail={student?.studentVerifiedAt ? student.studentEmail : null}
        discountPercent={STUDENT_DISCOUNT.discountPercent}
      />

      <LimelightSection userId={session.user.id} email={session.user.email ?? ""} locale={locale} />

    </div>
  );
}
