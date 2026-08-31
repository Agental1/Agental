import { toLocale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  FolderKanban,
  CheckCircle2,
  Plus,
  ShieldCheck,
  ArrowRight,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, { label: string; variant: "accent" | "success" | "neutral" | "warning" }> = {
  DRAFT: { label: "Brouillon", variant: "neutral" },
  OPEN: { label: "Ouvert", variant: "warning" },
  SHORTLISTING: { label: "Short-list", variant: "accent" },
  CLOSED: { label: "Fermé", variant: "neutral" },
};

export default async function CastingProjectsDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "casting" });

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: {
      organization: {
        include: { projects: { include: { candidatures: true }, orderBy: { createdAt: "desc" } } },
      },
    },
  });
  const org = membership?.organization;
  const verified = org?.siretStatus === "VERIFIED";
  const projects = org?.projects ?? [];
  const openCount = projects.filter((p) => ["OPEN", "SHORTLISTING"].includes(p.status)).length;
  const totalCandidates = projects.reduce((s, p) => s + p.candidatures.length, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">{org?.name}</h1>
          <p className="text-fg-muted">{t("space.projects.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {verified ? (
            <Badge variant="success">
              <ShieldCheck />{t("space.projects.siretVerified")}</Badge>
          ) : (
            <Badge variant="warning">{t("space.projects.siretPending")}</Badge>
          )}
          <Badge variant="neutral">Plan {org?.plan}</Badge>
          <Button asChild size="sm">
            <Link href="/casting/app/projets/nouveau">
              <Plus />{t("space.projects.newBrief")}</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Projets ouverts", value: openCount, icon: FolderKanban },
          { label: "Short-lists en cours", value: projects.filter((p) => p.status === "SHORTLISTING").length, icon: CheckCircle2 },
          { label: "Talents shortlistés", value: totalCandidates, icon: Users },
        ].map((k) => (
          <div key={k.label} className="rounded-sedan border border-border bg-surface p-5">
            <k.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-3xl">{k.value}</p>
            <p className="text-sm text-fg-muted">{k.label}</p>
          </div>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-10 text-center">
          <FolderKanban className="mx-auto size-8 text-accent" />
          <h2 className="mt-3 font-display text-xl font-medium">{t("space.projects.firstTitle")}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{t("space.projects.firstBody")}</p>
          <Button asChild className="mt-5">
            <Link href="/casting/app/projets/nouveau">
              <Plus />{t("space.projects.newBrief")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-display text-xl font-medium">{t("space.projects.yours")}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-sedan border border-border bg-surface">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/casting/app/projets/${p.id}`}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-sm text-fg-muted">
                      {p.candidatures.length} profil(s) shortlisté(s)
                    </p>
                  </div>
                  <Badge variant={STATUS[p.status]?.variant ?? "neutral"}>
                    {STATUS[p.status]?.label ?? p.status}
                  </Badge>
                  <ArrowRight className="size-4 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
