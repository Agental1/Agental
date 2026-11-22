import { date, percent } from "@/lib/format";
import { formatPlanPrice } from "@/lib/plan-price";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bell, CreditCard, Globe, Lock, UserCog } from "lucide-react";
import { auth } from "@/auth";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RgpdSection } from "@/components/app/rgpd-section";
import { ConsentSettings } from "@/components/consent/consent-settings";
import { getAccountConsent, getAccountConsentRecord } from "@/lib/account-prefs";
import { LanguageForm, NotificationsForm } from "@/components/app/settings-forms";
import { RoleAlertForm, type RoleAlertChannel } from "@/components/app/role-alert-form";

const roleAlertChannel = (v: string | null | undefined): RoleAlertChannel =>
  v === "sms" || v === "both" ? v : "email";
import { ConnectedAccounts } from "@/components/app/connected-accounts";
import { B2C_PLANS } from "@/domain/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.settings.title") };
}

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });
  const tc = await getTranslations({ locale, namespace: "common" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const [profile, account, consentRecord, consent] = await Promise.all([
    prisma.artistProfile.findUnique({
      where: { userId },
      select: { stageName: true, roleAlertChannel: true, phoneE164: true, smsConsentAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        emailVerified: true,
        passwordHash: true,
        locale: true,
        notifyApplications: true,
        notifyMessages: true,
        notifyProduct: true,
      },
    }),
    getAccountConsentRecord(userId),
    getAccountConsent(userId),
  ]);
  const { plan } = await getTalentPlan(userId);
  const planDef = B2C_PLANS[plan];
  // Display name from the messages, in the order of the B2C_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const planName = planNames[Object.keys(B2C_PLANS).indexOf(plan)] ?? plan;
  const hasPassword = Boolean(account?.passwordHash);

  // Sections, in this order. Each has an id so a link can open it.
  const sections = [
    { id: "account", icon: UserCog, title: t("space.settings.sections.account") },
    { id: "language", icon: Globe, title: t("space.settings.sections.language") },
    { id: "notifications", icon: Bell, title: t("space.settings.sections.notifications") },
    { id: "privacy", icon: Lock, title: t("space.settings.sections.privacy") },
    { id: "subscription", icon: CreditCard, title: t("space.settings.sections.subscription") },
  ];
  const meta = Object.fromEntries(sections.map((s) => [s.id, s]));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.settings.title")}</h1>
        <p className="text-fg-muted">{t("space.settings.subtitle")}</p>
      </div>

      <nav aria-label={t("space.settings.title")} className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <Section {...meta.account}>
        <Row label={t("space.settings.name")} value={profile?.stageName || "-"} />
        <Row
          label={t("space.settings.email")}
          value={account?.email ?? session.user.email ?? "-"}
          badge={
            <Badge variant={account?.emailVerified ? "success" : "neutral"}>
              {account?.emailVerified ? t("space.settings.emailVerified") : t("space.settings.emailUnverified")}
            </Badge>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-fg-muted">{t("space.settings.password")}</span>
          <Button asChild variant="outline" size="sm">
            <Link href="/mot-de-passe-oublie">
              {hasPassword ? t("space.settings.passwordChange") : t("space.settings.passwordSet")}
            </Link>
          </Button>
        </div>
        <p className="text-[13px] text-fg-subtle">{t("space.settings.passwordHint")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/talents/app/profil">{t("space.settings.editProfile")}</Link>
        </Button>
        <div className="border-t border-border pt-4">
          <ConnectedAccounts userId={userId} locale={locale} embedded />
        </div>
        <Link
          href="/talents/app?welcome=1"
          className="inline-flex min-h-11 items-center text-sm font-bold text-accent underline-offset-4 hover:underline"
        >
          {tc("tour.replay")}
        </Link>
      </Section>

      <Section {...meta.language}>
        <p className="text-sm text-fg-muted">{t("space.settings.language.lead")}</p>
        <LanguageForm current={toLocale(account?.locale ?? locale)} />
      </Section>

      <Section {...meta.notifications}>
        <p className="text-sm text-fg-muted">{t("space.settings.notifications.lead")}</p>
        <NotificationsForm
          initial={{
            applications: account?.notifyApplications ?? true,
            messages: account?.notifyMessages ?? true,
            product: account?.notifyProduct ?? false,
          }}
        />
        <RoleAlertForm
          initial={roleAlertChannel(profile?.roleAlertChannel)}
          hasPhone={!!profile?.phoneE164}
          consentGiven={!!profile?.smsConsentAt}
        />
      </Section>

      <Section {...meta.privacy}>
        <p className="text-sm text-fg-muted">
          {consentRecord
            ? tc("consent.recordedOn", {
                date: date(new Date(consentRecord.at), locale),
                version: consentRecord.version ?? "1",
              })
            : tc("consent.notRecorded")}
        </p>
        <ConsentSettings current={consent} embedded />
        <RgpdSection embedded />
        <Link
          href="/talents/confidentialite"
          className="inline-flex min-h-11 items-center text-sm font-bold text-accent underline-offset-4 hover:underline"
        >
          {t("space.settings.privacyPolicy")}
        </Link>
      </Section>

      <Section {...meta.subscription}>
        <div className="flex items-center gap-2">
          <Badge variant="accent">{t("space.dashboard.plan", { plan: planName })}</Badge>
          <span className="text-sm text-fg-muted">
            {t("space.settings.planSummary", {
              price: formatPlanPrice(planDef.priceCents, locale),
              rate: percent(planDef.commissionRate, locale),
            })}
          </span>
        </div>
        <p className="text-sm text-fg-muted">{t("space.settings.subNote")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/talents/app/abonnement">{t("space.settings.manage")}</Link>
        </Button>
      </Section>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4 rounded-sedan-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-medium">
        <Icon className="size-4 text-accent" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {value}
        {badge}
      </span>
    </div>
  );
}
