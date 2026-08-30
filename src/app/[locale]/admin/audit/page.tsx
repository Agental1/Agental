import { dateTime } from "@/lib/format";
import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Bang — Audit" };

export default async function AdminAuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const audits = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">Audit trail</h1>
        <p className="text-fg-muted">
          Toutes les décisions et actions, tracées — la neutralité prouvée.
        </p>
      </div>
      <div className="overflow-hidden rounded-sedan border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/60 text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Ressource</th>
              <th className="px-4 py-3 font-medium">Acteur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {audits.map((a) => (
              <tr key={a.id} className="bg-surface">
                <td className="px-4 py-2.5 tabular-nums text-xs text-fg-subtle">
                  {dateTime(a.createdAt, locale)}
                </td>
                <td className="px-4 py-2.5 font-medium">{a.action}</td>
                <td className="px-4 py-2.5 text-fg-muted">
                  {a.resourceType}
                  <span className="text-fg-subtle"> · {a.resourceId.slice(0, 8)}</span>
                </td>
                <td className="px-4 py-2.5 text-fg-muted">
                  {a.actor?.email ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
