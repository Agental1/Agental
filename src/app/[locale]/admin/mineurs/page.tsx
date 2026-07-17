import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Bang — Mineurs" };

const STATE_LABEL: Record<string, string> = {
  OPENED: "Ouvert",
  DOCS_PENDING: "Pièces en attente",
  READY: "Prêt",
  BLOCKED: "Bloqué",
};

export default async function AdminMinorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const cases = await prisma.minorCase.findMany({
    orderBy: { updatedAt: "desc" },
    include: { artistProfile: true, project: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Dossiers mineurs</h1>
        <p className="text-fg-muted">
          Autorisation préfectorale, séquestre 90 %, présence parentale.
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-10 text-center">
          <ShieldCheck className="mx-auto size-8 text-success" />
          <p className="mt-3 text-sm text-fg-muted">Aucun dossier mineur ouvert.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-sedan border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Talent</th>
                <th className="px-4 py-3 font-medium">Projet</th>
                <th className="px-4 py-3 font-medium">Préfectorale</th>
                <th className="px-4 py-3 font-medium">Séquestre</th>
                <th className="px-4 py-3 font-medium">Parental</th>
                <th className="px-4 py-3 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cases.map((c) => (
                <tr key={c.id} className="bg-surface">
                  <td className="px-4 py-2.5 font-medium">
                    {c.artistProfile.stageName}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {c.project?.title ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.prefectoralAuthStatus === "GRANTED" ? "success" : "warning"}>
                      {c.prefectoralAuthStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.escrowStatus === "HELD" ? "success" : "warning"}>
                      {c.escrowPercent}% · {c.escrowStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.parentalPresence ? "success" : "warning"}>
                      {c.parentalPresence ? "OK" : "À confirmer"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={c.state === "READY" ? "success" : "neutral"}>
                      {STATE_LABEL[c.state] ?? c.state}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
