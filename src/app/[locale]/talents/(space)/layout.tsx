import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { PlanSwitcher, type SwitcherPlan } from "@/components/app/plan-switcher";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import { formatPlanPrice } from "@/lib/plan-price";
import { LIMELIGHT } from "@/domain/limelight";

/** Route + icon are structure; the label is looked up per locale below. */
const NAV = [
  { href: "/talents/app", key: "dashboard", icon: "dashboard" },
  { href: "/talents/app/profil", key: "profile", icon: "user" },
  { href: "/talents/app/candidatures", key: "candidatures", icon: "send" },
  { href: "/talents/app/self-tape", key: "selftape", icon: "video" },
  { href: "/talents/app/carriere", key: "career", icon: "career" },
  { href: "/talents/app/abonnement", key: "subscription", icon: "billing" },
  { href: "/talents/app/messages", key: "messages", icon: "messages" },
  { href: "/talents/app/parametres", key: "settings", icon: "settings" },
] as const;

export default async function TalentsAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "talents" });
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return redirect({ href: "/connexion", locale });
  }
  // Representation gate: opportunities require a signed Mandat, not a plan.
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { mandat: true },
  });
  if (!profile?.mandat?.signedAt || profile.mandat.status !== "ACTIVE") {
    return redirect({ href: "/talents/inscription", locale });
  }

  // The plan badge at the top right opens the plan switcher on every page.
  const subscription = await prisma.subscription.findUnique({
    where: { subjectId: session.user.id },
  });
  const current = (subscription?.plan ?? "FREE") as PlanB2C;
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: SwitcherPlan[] = (Object.keys(B2C_PLANS) as PlanB2C[]).map((p, i) => ({
    plan: p,
    name: planNames[i] ?? p,
    price: formatPlanPrice(B2C_PLANS[p].priceCents, locale),
    unit: t("pricing.perMonth"),
    features: t.raw(`space.planFeatures.${p}`) as string[],
  }));

  const toItem = (n: (typeof NAV)[number]): AppNavItem => ({
    href: n.href,
    icon: n.icon,
    label: t(`space.nav.${n.key}`),
  });

  return (
    <AppShell
      portal="talents"
      home="/talents/app"
      nav={[
        ...NAV.slice(0, 5).map(toItem),
        // Limelight lives on the public site; the app links to it.
        { href: `/talents/${LIMELIGHT.slug}`, icon: "website", label: t("limelight.navApp") },
        ...NAV.slice(5).map(toItem),
      ]}
      userLabel={session.user.email ?? t("space.nav.account")}
      planSlot={
        <PlanSwitcher
          portal="talents"
          current={current}
          plans={plans}
          detailsHref="/talents/app/abonnement"
        />
      }
    >
      {children}
    </AppShell>
  );
}
