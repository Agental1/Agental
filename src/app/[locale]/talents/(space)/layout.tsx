import { cookies } from "next/headers";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar, AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { parseRequiredSince, requiresEmailVerification, showsVerifyBanner } from "@/domain/email-verification";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { ConsentSync } from "@/components/consent/consent-sync";
import { syncAccountPrefs } from "@/lib/account-prefs";
import { prefillFromProvider } from "@/lib/profile-prefill";
import { emailSenderConfigured } from "@/lib/mailer";

import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { PlanSwitcher, type SwitcherPlan } from "@/components/app/plan-switcher";
import { MessagesShortcut } from "@/components/app/messages-shortcut";
import { B2C_PLANS } from "@/domain/pricing";
import type { PlanB2C } from "@/domain/enums";
import { formatPlanPrice, planFeatureLines } from "@/lib/plan-price";
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
  let me = await prisma.artistProfile.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, stageName: "" },
    update: {},
    select: { id: true, stageName: true, avatarUpdatedAt: true, avatarKey: true },
  });
  // First Google sign-in: fill the names Google gave, only where still empty.
  if (!me.stageName) me = (await prefillFromProvider(session.user.id)) ?? me;
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
  const emailOpts = {
    senderConfigured: emailSenderConfigured(),
    requiredSince: parseRequiredSince(process.env.EMAIL_VERIFICATION_REQUIRED_SINCE),
  };
  if (emailState && requiresEmailVerification(emailState, emailOpts)) {
    return redirect({ href: "/verifier", locale });
  }
  const prefs = await syncAccountPrefs(session.user.id, locale);
  const verifyBanner = !!emailState && showsVerifyBanner(emailState, emailOpts);

  // The plan the talent really has, the Limelight Pro months included.
  const { plan: current } = await getTalentPlan(session.user.id);
  const usage = await getRoleSearchQuota(session.user.id);
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const plans: SwitcherPlan[] = (Object.keys(B2C_PLANS) as PlanB2C[]).map((p, i) => ({
    plan: p,
    name: planNames[i] ?? p,
    price: formatPlanPrice(B2C_PLANS[p].priceCents, locale),
    unit: t("pricing.perMonth"),
    features: planFeatureLines(t.raw(`space.planFeatures.${p}`) as string[], locale, p),
  }));

  const toItem = (n: (typeof NAV)[number]): AppNavItem => ({
    href: n.href,
    icon: n.icon,
    label: t(`space.nav.${n.key}`),
  });

  // The folded sidebar is remembered in the shadcn cookie.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      portal="talents"
      home="/talents/app"
      // No "Website" item since round 8: Limelight is on the Subscription page.
      nav={NAV.map(toItem)}
      defaultOpen={sidebarOpen}
      userLabel={session.user.email ?? t("space.nav.account")}
      avatarSlot={<AvatarEditor src={avatar.src} initials={avatar.initials} size={32} />}
      userMenu={{
        avatar: <Avatar src={avatar.src} initials={avatar.initials} size={36} />,
        profileHref: "/talents/app/profil",
        settingsHref: "/talents/app/parametres",
        labels: {
          account: t("space.nav.account"),
          profile: t("space.nav.profile"),
          settings: t("space.nav.settings"),
        },
      }}
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
      <ConsentSync consent={prefs.consent} at={prefs.consentAt} pv={prefs.consentVersion} />
      <MessagesShortcut />
      {verifyBanner && session.user.email && <VerifyEmailBanner email={session.user.email} />}
      {children}
    </AppShell>
  );
}
