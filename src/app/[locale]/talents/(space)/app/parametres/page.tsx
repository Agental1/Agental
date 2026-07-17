import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ShieldCheck, CreditCard, UserCog, LogOut } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";
import { B2C_PLANS } from "@/domain/pricing";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
        <h1 className="font-display text-3xl font-medium">Paramètres</h1>
        <p className="text-fg-muted">Ton compte, ton mandat, ton abonnement.</p>
      </div>

      <Section icon={UserCog} title="Compte">
        <Row label="Email" value={session.user.email ?? "—"} />
        <Row label="Nom artistique" value={profile?.stageName ?? "—"} />
        <Button asChild variant="outline" size="sm">
          <Link href="/talents/app/profil">Modifier mon profil</Link>
        </Button>
      </Section>

      <Section icon={ShieldCheck} title="Mandat de représentation">
        <div className="flex items-center gap-2">
          <Badge variant="success">
            {profile?.mandat?.status === "ACTIVE" ? "Actif" : "Inactif"}
          </Badge>
          {profile?.mandat?.signedAt && (
            <span className="text-sm text-fg-muted">
              Signé le {profile.mandat.signedAt.toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted">
          Gratuit, résiliable à tout moment. C&apos;est lui qui te fait
          représenter — indépendamment de tout abonnement.
        </p>
      </Section>

      <Section icon={CreditCard} title="Abonnement">
        <div className="flex items-center gap-2">
          <Badge variant="accent">Plan {plan}</Badge>
          <span className="text-sm text-fg-muted">
            {(planDef.priceCents / 100).toFixed(0)} €/mois · commission{" "}
            {Math.round(planDef.commissionRate * 100)}%
          </span>
        </div>
        <p className="text-sm text-fg-muted">
          Service technologique optionnel. Il n&apos;achète jamais un accès aux
          opportunités.
        </p>
        <Button variant="outline" size="sm" disabled>
          Gérer l&apos;abonnement (bientôt)
        </Button>
      </Section>

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
