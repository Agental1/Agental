"use client";

import { useState } from "react";
import { Bot, Hand, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CandidatureRow {
  id: string;
  projectTitle: string;
  status: string;
  source: string;
  score: number | null;
  justification: string | null;
  rateEuros: number | null;
  appliedAt: string;
  auto: boolean;
}

const GROUPS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: "all", label: "Toutes", match: () => true },
  { key: "sent", label: "Envoyées", match: (s) => s === "NEW" },
  {
    key: "short",
    label: "Shortlistées",
    match: (s) =>
      ["SHORTLISTED", "STARRED", "INVITED", "SELFTAPE_REQUESTED"].includes(s),
  },
  { key: "won", label: "Contractualisées", match: (s) => s === "CONTRACTED" },
  {
    key: "closed",
    label: "Sans suite",
    match: (s) => ["REJECTED", "EXCLUDED"].includes(s),
  },
];

const STATUS_LABEL: Record<string, string> = {
  NEW: "Envoyée",
  SHORTLISTED: "Shortlistée",
  STARRED: "Retenue",
  INVITED: "Invitée en audition",
  SELFTAPE_REQUESTED: "Self-tape demandé",
  CONTRACTED: "Contractualisée",
  REJECTED: "Sans suite",
  EXCLUDED: "Écartée",
};

function statusVariant(s: string) {
  if (["CONTRACTED", "STARRED", "INVITED"].includes(s)) return "success" as const;
  if (["SHORTLISTED", "SELFTAPE_REQUESTED"].includes(s)) return "accent" as const;
  if (["REJECTED", "EXCLUDED"].includes(s)) return "neutral" as const;
  return "warning" as const;
}

export function CandidaturesList({ rows }: { rows: CandidatureRow[] }) {
  const [tab, setTab] = useState("all");
  const group = GROUPS.find((g) => g.key === tab)!;
  const filtered = rows.filter((r) => group.match(r.status));

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        {GROUPS.map((g) => (
          <TabsTrigger key={g.key} value={g.key}>
            {g.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={tab}>
        {filtered.length === 0 ? (
          <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-fg-muted">
            Aucune candidature ici pour l&apos;instant. L&apos;IA veille et postule
            pour toi dès qu&apos;un rôle te correspond.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-4 rounded-sedan border border-border bg-surface p-4"
              >
                {r.score != null && <ScoreRing score={r.score} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.projectTitle}</span>
                    <Badge variant={statusVariant(r.status)}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    <Badge variant="neutral">
                      {r.auto ? <Bot /> : <Hand />}
                      {r.auto ? "Auto IA" : "Manuelle"}
                    </Badge>
                  </div>
                  {r.justification && (
                    <p className="mt-1 text-xs text-fg-muted">{r.justification}</p>
                  )}
                </div>
                {r.rateEuros != null && (
                  <div className="flex items-center gap-1 text-sm text-fg-muted">
                    <MapPin className="size-3.5" />
                    {r.rateEuros} €/j
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm font-medium",
        score >= 90
          ? "border-success text-success"
          : score >= 80
            ? "border-accent text-accent"
            : "border-border text-fg-muted"
      )}
    >
      {score}
    </div>
  );
}
