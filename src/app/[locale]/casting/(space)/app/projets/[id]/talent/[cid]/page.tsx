import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Sparkles, History, ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import {
  MinorWorkflow,
  type MinorCaseData,
} from "@/components/casting/minor-workflow";
import { parseJson, PhysicalTraits } from "@/domain/json";
import { z } from "zod";

export const metadata: Metadata = { title: "Fiche talent" };

const Factors = z.record(z.string(), z.number());

export default async function FicheTalentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; cid: string }>;
}) {
  const { locale, id, cid } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  if (!membership) return null;

  const cand = await prisma.candidature.findUnique({
    where: { id: cid },
    include: {
      matchScore: true,
      project: true,
      artistProfile: {
        include: { specialties: true, media: true, minorCase: true },
      },
      externalTalent: true,
    },
  });
  if (
    !cand ||
    cand.projectId !== id ||
    cand.project.organizationId !== membership.organizationId
  ) {
    notFound();
  }

  const isAgental = !!cand.artistProfile;
  const p = cand.artistProfile;
  const phys = p ? parseJson(PhysicalTraits, p.physical) : null;
  const factors = parseJson(Factors, cand.matchScore?.factors ?? "{}");
  const name = p?.stageName ?? cand.externalTalent?.name ?? "Talent";
  const rate = cand.estimatedRateCents ? cand.estimatedRateCents / 100 : null;

  const audits = await prisma.auditLog.findMany({
    where: { organizationId: membership.organizationId, resourceId: cid },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const minorCase: MinorCaseData | null = p?.minorCase
    ? {
        id: p.minorCase.id,
        prefectoralAuthStatus: p.minorCase.prefectoralAuthStatus,
        parentalPresence: p.minorCase.parentalPresence,
        escrowPercent: p.minorCase.escrowPercent,
        escrowStatus: p.minorCase.escrowStatus,
        state: p.minorCase.state,
      }
    : null;

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href={`/casting/app/projets/${id}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Retour à la short-list
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-5 rounded-sedan border border-border bg-surface p-5">
        <div className="size-24 overflow-hidden rounded-sedan bg-surface-2">
          {p?.media.find((m) => m.isPrimary) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/media/${p.media.find((m) => m.isPrimary)!.id}`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-fg-subtle">
              photo
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-medium">{name}</h1>
            <Badge variant={isAgental ? "solid" : "neutral"}>
              {isAgental ? "Agental" : "External"}
            </Badge>
            {p?.isMinor && <Badge variant="warning">Mineur</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-fg-muted">
            {p?.city && <span>{p.city}</span>}
            {rate != null && <span className="font-medium text-fg">{rate} €/j</span>}
            <Badge variant="success">Disponible</Badge>
          </div>
        </div>
        {cand.matchScore && (
          <div className="flex size-16 items-center justify-center rounded-full border-2 border-accent font-display text-xl text-accent">
            {cand.matchScore.score}
          </div>
        )}
      </div>

      {/* AI justification */}
      {cand.matchScore && (
        <section className="rounded-sedan border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-medium">
            <Sparkles className="size-4 text-accent" /> Justification du classement
          </h2>
          <p className="mt-2 text-sm text-fg-muted">{cand.matchScore.justification}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(factors).map(([k, v]) => (
              <Badge key={k} variant={v >= 0.7 ? "success" : "neutral"}>
                {k} {Math.round(v * 100)}%
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Data */}
      {p && (
        <section className="grid gap-4 rounded-sedan border border-border bg-surface p-5 sm:grid-cols-2">
          <Data label="Langues" value={phys?.languages.join(", ") || "—"} />
          <Data label="Accents" value={phys?.accents.join(", ") || "—"} />
          <Data label="Taille" value={phys?.heightCm ? `${phys.heightCm} cm` : "—"} />
          <Data
            label="Spécialités"
            value={p.specialties.map((s) => s.kind).join(", ") || "—"}
          />
        </section>
      )}

      {/* Minors workflow */}
      {p?.isMinor && <MinorWorkflow candidatureId={cid} minorCase={minorCase} />}

      {/* Audit trail */}
      <section className="rounded-sedan border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-medium">
          <History className="size-4 text-accent" /> Journal (audit trail)
        </h2>
        {audits.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">
            Chaque décision de classement et d&apos;action est tracée ici.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm">
            {audits.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-fg-muted">
                <span className="tabular-nums text-xs text-fg-subtle">
                  {a.createdAt.toLocaleString("fr-FR")}
                </span>
                <span className="font-medium text-fg">{a.action}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
