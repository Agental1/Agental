import { date } from "@/lib/format";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck, CreditCard, UserCog, LogOut } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";
import { RgpdSection } from "@/components/app/rgpd-section";
import { B2C_PLANS } from "@/domain/pricing";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage({
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
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { mandat: true },
  });
  const subscription = await prisma.subscription.findUnique({
    where: { subjectId: session.user.id },
  });
  const plan = (subscription?.plan ?? "FREE") as keyof typeof B2C_PLANS;
  const planDef = B2C_PLANS[plan];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.settings.title")}</h1>
        <p className="text-fg-muted">{t("space.settings.subtitle")}</p>
      </div>

      <Section icon={UserCog} title="Compte">
        <Row label="Email" value={session.user.email ?? "—"} />
        <Row label="Nom artistique" value={profile?.stageName ?? "—"} />
        <Button asChild variant="outline" size="sm">
          <Link href="/talents/app/profil">{t("space.settings.editProfile")}</Link>
        </Button>
      </Section>

      <Section icon={ShieldCheck} title={t("space.settings.mandat")}>
        <div className="flex items-center gap-2">
          <Badge variant="success">
            {profile?.mandat?.status === "ACTIVE" ? "Actif" : "Inactif"}
          </Badge>
          {profile?.mandat?.signedAt && (
            <span className="text-sm text-fg-muted">
              Signé le {date(profile.mandat.signedAt, locale)}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted">{t("space.settings.mandatNote")}</p>
      </Section>

      <Section icon={CreditCard} title="Abonnement">
        <div className="flex items-center gap-2">
          <Badge variant="accent">Plan {plan}</Badge>
          <span className="text-sm text-fg-muted">
            {(planDef.priceCents / 100).toFixed(0)} €/mois · commission{" "}
            {Math.round(planDef.commissionRate * 100)}%
          </span>
        </div>
        <p className="text-sm text-fg-muted">{t("space.settings.subNote")}</p>
        <Button variant="outline" size="sm" disabled>
          {t("space.settings.manageSub")}
        </Button>
      </Section>

      <RgpdSection />

      <form action={logoutAction}>
        <Button type="submit" variant="ghost">
          <LogOut className="size-4" /> Se déconnecter
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
