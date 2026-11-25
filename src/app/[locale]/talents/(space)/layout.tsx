import { cookies } from "next/headers";
import { toLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Avatar, AvatarEditor } from "@/components/app/avatar-editor";
import { avatarSrc, initialsOf } from "@/domain/avatar";
import { requiresEmailVerification } from "@/domain/email-verification";
import { emailVerificationRequired } from "@/lib/app-settings";
import { VerifyEmailCodeBanner } from "@/components/auth/email-code";
import { emailCodeAvailable } from "@/lib/email-code";
import { ConsentSync } from "@/components/consent/consent-sync";
import { syncAccountPrefs } from "@/lib/account-prefs";
import { prefillFromProvider } from "@/lib/profile-prefill";

import { AppShell, type AppNavItem } from "@/components/app/app-shell";
import { NotificationBell } from "@/components/app/notification-bell";
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
      headerSlot={<NotificationBell portal="talents" />}
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
        />
      }
    >
      <ConsentSync consent={prefs.consent} at={prefs.consentAt} pv={prefs.consentVersion} />
      <MessagesShortcut />
      {verifyBanner && emailState && <VerifyEmailCodeBanner email={emailState.email} portal="talents" />}
      {children}
    </AppShell>
  );
}
