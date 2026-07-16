import { setRequestLocale } from "next-intl/server";
import { FolderKanban, CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function CastingProjectsDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) return null; // layout guard handles redirect
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: { include: { projects: true } } },
  });
  const org = membership?.organization;
  const verified = org?.siretStatus === "VERIFIED";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">{org?.name}</h1>
          <p className="text-fg-muted">
            Vos projets de casting et vos short-lists.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {verified ? (
            <Badge variant="success">
              <ShieldCheck /> SIRET vérifié
            </Badge>
          ) : (
            <Badge variant="warning">SIRET en attente</Badge>
          )}
          <Badge variant="neutral">Plan Free</Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Projets ouverts", value: org?.projects.length ?? 0, icon: FolderKanban },
          { label: "Short-lists en cours", value: 0, icon: CheckCircle2 },
          { label: "Talents reçus", value: 0, icon: CheckCircle2 },
        ].map((k) => (
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

      <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-10 text-center">
        <FolderKanban className="mx-auto size-8 text-accent" />
        <h2 className="mt-3 font-display text-xl font-medium">
          Créez votre premier brief
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
          Décrivez un rôle à notre assistant : il structure votre demande et
          génère une short-list calibrée, source affichée sur chaque profil.
        </p>
        <Button className="mt-5" disabled>
          <Plus /> Nouveau brief (bientôt)
        </Button>
      </div>
    </div>
  );
}
