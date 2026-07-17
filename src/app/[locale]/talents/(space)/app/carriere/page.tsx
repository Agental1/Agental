import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { TrendingUp, Wallet, Percent } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Ma carrière" };

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

export default async function CarrierePage({
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
  });
  if (!profile) return null;

  const entries = await prisma.careerEntry.findMany({
    where: { profileId: profile.id },
    orderBy: { date: "desc" },
  });

  const grossCents = entries.reduce((s, e) => s + e.cachetCents, 0);
  const commissionCents = entries.reduce((s, e) => s + e.commissionCents, 0);
  const netCents = grossCents - commissionCents;

  const stats = [
    { label: "Cachets bruts", value: euros(grossCents), icon: Wallet },
    { label: "Net perçu", value: euros(netCents), icon: TrendingUp },
    { label: "Commission Agental", value: euros(commissionCents), icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Ma carrière</h1>
        <p className="text-fg-muted">Tes rôles, tes cachets, ta progression.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-sedan border border-border bg-surface p-5">
            <s.icon className="size-5 text-accent" />
            <p className="mt-3 font-display text-2xl">{s.value}</p>
            <p className="text-sm text-fg-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-fg-muted">
          Ton historique de rôles apparaîtra ici dès ton premier cachet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-sedan border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Cachet</th>
                <th className="px-4 py-3 font-medium text-right">Commission</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e) => (
                <tr key={e.id} className="bg-surface">
                  <td className="px-4 py-3 font-medium">{e.role}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {e.date.toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">{euros(e.cachetCents)}</td>
                  <td className="px-4 py-3 text-right text-fg-muted">
                    {euros(e.commissionCents)} ({Math.round(e.commissionRate * 100)}%)
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={e.status === "PAID" ? "success" : "warning"}>
                      {e.status === "PAID" ? "Payé" : "En attente"}
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
