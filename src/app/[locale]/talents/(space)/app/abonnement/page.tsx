import { percent } from "@/lib/format";
import { formatPlanPrice } from "@/lib/plan-price";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PlanSelector, type PlanCard } from "@/components/talents/plan-selector";
import { RentabiliteWidget } from "@/components/talents/rentabilite-widget";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";

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
  const [subscription, career, profile] = await Promise.all([
    prisma.subscription.findUnique({ where: { subjectId: session.user.id } }),
    prisma.careerEntry.findMany({
      where: { profile: { userId: session.user.id } },
    }),
    prisma.artistProfile.findUnique({ where: { userId: session.user.id } }),
  ]);

  const current = (subscription?.plan ?? "FREE") as PlanB2C;
  const annualCachetCents = career.reduce((s, e) => s + e.cachetCents, 0);

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
    features: t.raw(`space.planFeatures.${p}`) as string[],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.subscription.title")}</h1>
        <p className="text-fg-muted">{t("space.subscription.subtitle")}</p>
      </div>

      <PlanSelector plans={plans} current={current} />

      <RentabiliteWidget
        annualCachetCents={Math.max(annualCachetCents, profile?.minRateCents ? profile.minRateCents * 20 : 0)}
        currentPlan={current}
      />
    </div>
  );
}
