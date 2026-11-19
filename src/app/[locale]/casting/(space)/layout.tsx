import { Suspense } from "react";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { PlanSwitcher, type SwitcherPlan } from "@/components/app/plan-switcher";
import { FirstRunTour, type TourStep } from "@/components/app/first-run-tour";
import { B2B_PLANS } from "@/domain/pricing";
import type { PlanB2B } from "@/domain/enums";
import { formatPlanPrice } from "@/lib/plan-price";

/** Route + icon are structure; the label is looked up per locale below. */
const NAV = [
  { href: "/casting/app", key: "projects", icon: "projects" },
  { href: "/casting/app/abonnement", key: "subscription", icon: "billing" },
  { href: "/casting/app/parametres", key: "settings", icon: "settings" },
] as const;

export default async function CastingAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "casting" });
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") {
    return redirect({ href: "/connexion", locale });
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: true },
  });
  if (!membership) return redirect({ href: "/casting/inscription", locale });

  // The plan badge at the top right opens the plan switcher on every page.
  const current = membership.organization.plan as PlanB2B;
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: SwitcherPlan[] = (Object.keys(B2B_PLANS) as PlanB2B[]).map((p, i) => {
    const def = B2B_PLANS[p];
    const quoted = p === "ENTERPRISE";
    return {
      plan: p,
      name: planNames[i] ?? p,
      price: quoted ? t("space.subscription.onQuote") : formatPlanPrice(def.priceCents, locale),
      unit: quoted
        ? undefined
        : def.perSeat
          ? t("space.subscription.perSeatMonth")
          : def.priceCents
            ? t("space.subscription.perMonth")
            : undefined,
      features: t.raw(`space.planFeatures.${p}`) as string[],
      contactOnly: quoted,
    };
  });

  const tc = await getTranslations({ locale, namespace: "common" });
  const tourCopy = tc.raw("tour.casting") as { title: string; body: string }[];
  const tourPages = [
    { href: "/casting/app/projets/nouveau", page: t("space.projects.newBrief") },
    { href: "/casting/app", page: t("space.nav.projects") },
    { href: "/casting/app/abonnement", page: t("space.nav.subscription") },
  ];
  const listFormat = new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" });
  const fill = (body: string) =>
    body
      .replace("{free}", listFormat.format(t.raw("space.planFeatures.FREE") as string[]))
      .replace("{pro}", listFormat.format(t.raw("space.planFeatures.PRO") as string[]))
      .replace("{price}", formatPlanPrice(B2B_PLANS.PRO.priceCents, locale));
  const tourSteps: TourStep[] = tourCopy.map((step, i) => ({
    title: step.title,
    body: fill(step.body),
    ...tourPages[i],
  }));

  return (
    <AppShell
      portal="casting"
      home="/casting/app"
      nav={NAV.map((n): AppNavItem => ({
        href: n.href,
        icon: n.icon,
        label: t(`space.nav.${n.key}`),
      }))}
      userLabel={session.user.email ?? t("space.nav.account")}
      planSlot={
        <PlanSwitcher
          portal="casting"
          current={current}
          plans={plans}
          detailsHref="/casting/app/abonnement"
        />
      }
    >
      <Suspense fallback={null}>
        <FirstRunTour portal="casting" steps={tourSteps} />
      </Suspense>
      {children}
    </AppShell>
  );
}
