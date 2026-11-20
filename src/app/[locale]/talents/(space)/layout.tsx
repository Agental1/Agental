import { Suspense } from "react";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { parseRequiredSince, requiresEmailVerification } from "@/domain/email-verification";
import { emailSenderConfigured } from "@/lib/mailer";

import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { PlanSwitcher, type SwitcherPlan } from "@/components/app/plan-switcher";
import { FirstRunTour, type TourStep } from "@/components/app/first-run-tour";
import { MessagesShortcut } from "@/components/app/messages-shortcut";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import { formatPlanPrice } from "@/lib/plan-price";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { getRoleSearchQuota } from "@/lib/role-search";

/** Route + icon are structure; the label is looked up per locale below. */
const NAV = [
  { href: "/talents/app", key: "dashboard", icon: "dashboard" },
  { href: "/talents/app/profil", key: "profile", icon: "user" },
  { href: "/talents/app/candidatures", key: "candidatures", icon: "send" },
  // Messages sits right under Applications.
  { href: "/talents/app/messages", key: "messages", icon: "messages" },
  { href: "/talents/app/reel-self-tape", key: "selftape", icon: "video" },
  { href: "/talents/app/carriere", key: "career", icon: "career" },
  { href: "/talents/app/abonnement", key: "subscription", icon: "billing" },
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
  // No setup gate: the representation agreement is out of the beta, and the
  // dashboard's "Complete my profile" card resumes whatever is unfinished.
  // Every page below reads the profile row, so it exists before they render
  // (the same idempotent creation as ensureArtistProfile).
  const me = await prisma.artistProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, stageName: "" },
    update: {},
    select: { id: true, stageName: true, avatarUpdatedAt: true, avatarKey: true },
  });
  const avatar = {
    src: me.avatarKey ? avatarSrc(session.user.id, me.avatarUpdatedAt) : null,
    initials: initialsOf(me.stageName, session.user.email),
  };

  // The plan badge at the top right opens the plan switcher on every page.
  // Accounts that still have to confirm their email wait on "Check your inbox".
  // The gate stays open until an email sender and a start date are configured.
  const emailState = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, passwordHash: true, createdAt: true },
  });
  if (
    emailState &&
    requiresEmailVerification(emailState, {
      senderConfigured: emailSenderConfigured(),
      requiredSince: parseRequiredSince(process.env.EMAIL_VERIFICATION_REQUIRED_SINCE),
    })
  ) {
    return redirect({ href: "/verifier", locale });
  }

  // The plan the talent really has, the Limelight Pro months included.
  const { plan: current } = await getTalentPlan(session.user.id);
  const usage = await getRoleSearchQuota(session.user.id);
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: SwitcherPlan[] = (Object.keys(B2C_PLANS) as PlanB2C[]).map((p, i) => ({
    plan: p,
    name: planNames[i] ?? p,
    price: formatPlanPrice(B2C_PLANS[p].priceCents, locale),
    unit: t("pricing.perMonth"),
    features: t.raw(`space.planFeatures.${p}`) as string[],
  }));

  // The first-run tour: four short steps, with plan facts read from the
  // pricing table and the plan feature lists.
  const tc = await getTranslations({ locale, namespace: "common" });
  const tourCopy = tc.raw("tour.talent") as { title: string; body: string }[];
  const tourPages = [
    { href: "/talents/app/profil", page: t("space.nav.profile") },
    { href: "/talents/app", page: t("space.nav.dashboard") },
    { href: "/talents/app/candidatures", page: t("space.nav.candidatures") },
    { href: "/talents/app/abonnement", page: t("space.nav.subscription") },
  ];
  const listFormat = new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" });
  const fill = (body: string) =>
    body
      .replace("{free}", listFormat.format(t.raw("space.planFeatures.FREE") as string[]))
      .replace("{pro}", listFormat.format((t.raw("space.planFeatures.PRO") as string[]).slice(1)))
      .replace("{price}", formatPlanPrice(B2C_PLANS.PRO.priceCents, locale));
  const tourSteps: TourStep[] = tourCopy.map((step, i) => ({
    title: step.title,
    body: fill(step.body),
    ...tourPages[i],
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
        ...NAV.slice(0, 6).map(toItem),
        { href: "/talents/app/site", icon: "website", label: t("limelight.navApp") },
        ...NAV.slice(6).map(toItem),
      ]}
      userLabel={session.user.email ?? t("space.nav.account")}
      avatarSlot={<AvatarEditor src={avatar.src} initials={avatar.initials} size={32} />}
      planSlot={
        <PlanSwitcher
          portal="talents"
          current={current}
          plans={plans}
          detailsHref="/talents/app/abonnement"
          usage={usage}
          studentLink={{ href: "/talents/app/abonnement#student", label: t("space.student.link") }}
        />
      }
    >
      <Suspense fallback={null}>
        <FirstRunTour portal="talents" steps={tourSteps} />
      </Suspense>
      <MessagesShortcut />
      {children}
    </AppShell>
  );
}
