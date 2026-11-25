import { cookies } from "next/headers";
import { Suspense } from "react";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requiresEmailVerification } from "@/domain/email-verification";
import { emailVerificationRequired } from "@/lib/app-settings";
import { VerifyEmailCodeBanner } from "@/components/auth/email-code";
import { emailCodeAvailable } from "@/lib/email-code";
import { ConsentSync } from "@/components/consent/consent-sync";
import { syncAccountPrefs } from "@/lib/account-prefs";

import { Avatar } from "@/components/app/avatar-editor";
import { initialsOf } from "@/domain/avatar";
import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { NotificationBell } from "@/components/app/notification-bell";
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
  // A membership exists from the first wizard step; the app opens only once
  // the last step is done, so nobody skips it by typing the address.
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true },
  });
  if (!account?.onboardingCompletedAt) return redirect({ href: "/casting/inscription", locale });

  // Round 11: with "Email verification required before the dashboard" on
  // (Admin > Controls, off by default), an unconfirmed password account goes to
  // the code screen from every page. Google and Apple accounts pass.
  const emailState = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true, passwordHash: true },
  });
  const emailOpts = { gateOn: await emailVerificationRequired(), senderConfigured: emailCodeAvailable() };
  if (emailState && requiresEmailVerification(emailState, emailOpts)) {
    return redirect({ href: "/verifier", locale });
  }
  const prefs = await syncAccountPrefs(session.user.id, locale);
  // Round 10: every password account without a verified email sees "Verify your
  // email to start finding roles" with "Send me a code" (6-digit code).
  // Shown only while a code can actually be sent (production needs Resend).
  const verifyBanner = !!emailState && !!emailState.passwordHash && !emailState.emailVerified && emailCodeAvailable();

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

  // The folded sidebar is remembered in the shadcn cookie.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      defaultOpen={sidebarOpen}
      headerSlot={<NotificationBell portal="casting" />}
      languageInFooter
      portal="casting"
      home="/casting/app"
      nav={NAV.map((n): AppNavItem => ({
        href: n.href,
        icon: n.icon,
        label: t(`space.nav.${n.key}`),
      }))}
      userLabel={session.user.email ?? t("space.nav.account")}
      userMenu={{
        avatar: <Avatar src={null} initials={initialsOf("", session.user.email)} size={36} />,
        settingsHref: "/casting/app/parametres",
        labels: { account: t("space.nav.account"), profile: "", settings: t("space.nav.settings") },
      }}
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
      <ConsentSync consent={prefs.consent} at={prefs.consentAt} pv={prefs.consentVersion} />
      {verifyBanner && emailState && <VerifyEmailCodeBanner email={emailState.email} portal="casting" />}
      {children}
    </AppShell>
  );
}
