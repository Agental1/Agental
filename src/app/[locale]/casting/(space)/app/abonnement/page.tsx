import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Gauge } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  CastingPlanSelector,
  type CastingPlanCard,
} from "@/components/casting/casting-plan-selector";
import { B2B_PLANS } from "@/domain/pricing";
import { monthlyQuota, activeProjectsQuota } from "@/lib/quotas";
import type { PlanB2B } from "@/domain/enums";

export const metadata: Metadata = { title: "Abonnement" };

const FEATURES: Record<PlanB2B, string[]> = {
  FREE: ["1 projet actif", "50 candidatures triées/mois", "Score de base", "Provenance affichée"],
  PRO: ["10 projets actifs", "1 000 candidatures triées/mois", "Score détaillé", "Vérification self-tapes", "Filtres avancés"],
  STUDIO: ["Jusqu'à 5 sièges", "Projets & filtrages illimités", "Intégrations", "Support dédié"],
  ENTERPRISE: ["SSO", "SLA garanti", "API privée", "Grandes maisons"],
};

const euros = (c: number) => (c / 100).toFixed(0) + " €";

export default async function CastingAbonnementPage({
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
    include: { organization: true },
  });
  if (!membership) return null;
  const org = membership.organization;
  const plan = org.plan as PlanB2B;

  const [seatCount, projectsQ, candQ] = await Promise.all([
    prisma.seat.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
    activeProjectsQuota(org.id, plan),
    monthlyQuota(org.id, plan, "filteredCandidatures"),
  ]);

  const plans: CastingPlanCard[] = (Object.keys(B2B_PLANS) as PlanB2B[]).map((p) => {
    const def = B2B_PLANS[p];
    return {
      plan: p,
      name: def.plan,
      price: p === "ENTERPRISE" ? "Sur devis" : euros(def.priceCents),
      priceUnit: p === "ENTERPRISE" ? "" : def.perSeat ? "/siège/mois" : def.priceCents ? "/mois" : "",
      features: FEATURES[p],
      contactOnly: p === "ENTERPRISE",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Abonnement</h1>
        <p className="text-fg-muted">
          Une tarification par siège et par volume, pensée pour votre activité.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuotaCard
          label="Projets actifs"
          used={projectsQ.used}
          limit={projectsQ.limit}
        />
        <QuotaCard
          label="Candidatures triées ce mois"
          used={candQ.used}
          limit={candQ.limit}
        />
      </div>

      <CastingPlanSelector plans={plans} current={plan} seatCount={Math.max(1, seatCount)} />
    </div>
  );
}

function QuotaCard({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const near = limit != null && used / limit >= 0.8;
  return (
    <div className="rounded-sedan border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-fg-muted">
          <Gauge className="size-4" /> {label}
        </span>
        <span className="text-sm font-medium">
          {used}
          {limit != null ? ` / ${limit}` : " / ∞"}
        </span>
      </div>
      {limit != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${near ? "bg-warning" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
