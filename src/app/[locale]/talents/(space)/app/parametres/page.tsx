import { date, percent } from "@/lib/format";
import { formatPlanPrice } from "@/lib/plan-price";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck, CreditCard, UserCog, LogOut } from "lucide-react";
import { auth } from "@/auth";
import { getTalentPlan } from "@/lib/billing/entitlement";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";
import { RgpdSection } from "@/components/app/rgpd-section";
import { ConsentSettings } from "@/components/consent/consent-settings";
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
  const ta = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { mandat: true },
  });
  const { plan } = await getTalentPlan(session.user.id);
  const planDef = B2C_PLANS[plan];
  // Display name from the messages, in the order of the B2C_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const planName = planNames[Object.keys(B2C_PLANS).indexOf(plan)] ?? plan;

  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.settings.title")}</h1>
        <p className="text-fg-muted">{t("space.settings.subtitle")}</p>
      </div>

      <Section icon={UserCog} title={t("space.settings.account")}>
        <Row label={t("space.settings.email")} value={session.user.email ?? "—"} />
        <Row label={t("space.settings.stageName")} value={profile?.stageName ?? "—"} />
        <Button asChild variant="outline" size="sm">
          <Link href="/talents/app/profil">{t("space.settings.editProfile")}</Link>
        </Button>
      </Section>

      <Section icon={ShieldCheck} title={t("space.settings.mandat")}>
        <div className="flex items-center gap-2">
          <Badge variant="success">
            {profile?.mandat?.status === "ACTIVE"
              ? ta("mandatStatus.ACTIVE")
              : ta("mandatStatus.INACTIVE")}
          </Badge>
          {profile?.mandat?.signedAt && (
            <span className="text-sm text-fg-muted">
              {t("space.settings.signedOn", {
                date: date(profile.mandat.signedAt, locale),
              })}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted">{t("space.settings.mandatNote")}</p>
      </Section>

      <Section icon={CreditCard} title={t("space.settings.subscription")}>
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
        <Button variant="outline" size="sm" disabled>
          {t("space.settings.manageSub")}
        </Button>
      </Section>

      <Link
        href="/talents/app?welcome=1"
        className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
      >
        {tc("tour.replay")}
      </Link>

      <ConnectedAccounts userId={session.user.id} locale={locale} />

      <ConsentSettings />

      <RgpdSection />

      <form action={logoutAction}>
        <Button type="submit" variant="ghost">
          <LogOut className="size-4" /> {ta("actions.logout")}
        </Button>
      </form>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-sedan border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-medium">
        <Icon className="size-4 text-accent" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
