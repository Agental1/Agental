import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Building2, ShieldCheck, CreditCard, LogOut, Users } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Paramètres" };

export default async function CastingParametresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: { include: { seats: true } } },
  });
  if (!membership) return null;
  const org = membership.organization;
  const activeSeats = org.seats.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Paramètres</h1>
        <p className="text-fg-muted">Votre structure, vos sièges, votre abonnement.</p>
      </div>

      <Section icon={Building2} title="Structure">
        <Row label="Nom" value={org.name} />
        <Row label="SIRET" value={org.siret ?? "—"} />
        <div className="flex items-center gap-2">
          {org.siretStatus === "VERIFIED" ? (
            <Badge variant="success"><ShieldCheck /> Vérifié</Badge>
          ) : (
            <Badge variant="warning">En attente</Badge>
          )}
        </div>
      </Section>

      <Section icon={Users} title="Sièges">
        <Row label="Sièges actifs" value={String(activeSeats)} />
      </Section>

      <Section icon={CreditCard} title="Abonnement">
        <Row label="Plan" value={org.plan} />
        <Button asChild variant="outline" size="sm">
          <Link href="/casting/app/abonnement">Gérer l&apos;abonnement</Link>
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
