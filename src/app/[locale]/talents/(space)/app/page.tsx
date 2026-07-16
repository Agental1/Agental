import { setRequestLocale } from "next-intl/server";
import { Send, Clock, CalendarCheck, Sparkles, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function TalentsDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session!.user.id },
    include: { mandat: true, specialties: true },
  });

  const kpis = [
    { label: "Candidatures actives", value: 0, icon: Send },
    { label: "Retours en attente", value: 0, icon: Clock },
    { label: "Prochaines auditions", value: 0, icon: CalendarCheck },
    { label: "Opportunités urgentes", value: 0, icon: Sparkles },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">
            Bienvenue{profile?.stageName ? `, ${profile.stageName}` : ""}.
          </h1>
          <p className="text-fg-muted">
            On cherche pour toi, tu te concentres sur ton jeu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">Représenté</Badge>
          <Badge variant="neutral">Plan Free</Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-sedan border border-border bg-surface p-5"
          >
            <k.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-3xl">{k.value}</p>
            <p className="text-sm text-fg-muted">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-8 text-center">
        <Sparkles className="mx-auto size-8 text-accent" />
        <h2 className="mt-3 font-display text-xl font-medium">
          Ton agent IA se met au travail
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
          Complète ton profil et ajoute tes médias pour que l&apos;IA repère les
          castings faits pour toi. Plus ton dossier est complet, plus il
          performe.
        </p>
        <Button asChild className="mt-5">
          <Link href="/talents/app/profil">
            Compléter mon profil <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
