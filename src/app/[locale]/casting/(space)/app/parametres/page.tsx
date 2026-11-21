import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Building2, ShieldCheck, CreditCard, LogOut, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";
import { RgpdSection } from "@/components/app/rgpd-section";
import { ConsentSettings } from "@/components/consent/consent-settings";
import { getAccountConsent } from "@/lib/account-prefs";
import { ConnectedAccounts } from "@/components/app/connected-accounts";
import { B2B_PLANS } from "@/domain/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "casting" });
  return { title: t("space.settings.title") };
}

export default async function CastingParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });
  const ta = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: { include: { seats: true } } },
  });
  if (!membership) return null;
  const org = membership.organization;
  const activeSeats = org.seats.filter((s) => s.status === "ACTIVE").length;
  // Display name from the messages, in the order of the B2B_PLANS table.
  const planNames = (t.raw("pricing.plans") as { name: string }[]).map((p) => p.name);
  const planName = planNames[Object.keys(B2B_PLANS).indexOf(org.plan)] ?? org.plan;

  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.settings.title")}</h1>
        <p className="text-fg-muted">{t("space.settings.subtitle")}</p>
      </div>

      <Section icon={Building2} title={t("space.settings.org")}>
        <Row label={t("space.settings.name")} value={org.name} />
        <Row label={t("space.settings.siret")} value={org.siret ?? "—"} />
        <div className="flex items-center gap-2">
          {org.siretStatus === "VERIFIED" ? (
            <Badge variant="success"><ShieldCheck />{t("space.settings.verified")}</Badge>
          ) : (
            <Badge variant="warning">{t("space.settings.pending")}</Badge>
          )}
        </div>
      </Section>

      <Section icon={Users} title={t("space.settings.seats")}>
        <Row label={t("space.settings.activeSeats")} value={String(activeSeats)} />
      </Section>

      <Section icon={CreditCard} title={t("space.settings.subscription")}>
        <Row label={t("space.settings.plan")} value={planName} />
        <Button asChild variant="outline" size="sm">
          <Link href="/casting/app/abonnement">{t("space.settings.manageSub")}</Link>
        </Button>
      </Section>

      <Link
        href="/casting/app?welcome=1"
        className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline"
      >
        {tc("tour.replay")}
      </Link>

      <ConnectedAccounts userId={session.user.id} locale={locale} />

      <ConsentSettings current={await getAccountConsent(session.user.id)} />

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
