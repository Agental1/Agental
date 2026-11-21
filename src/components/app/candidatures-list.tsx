"use client";

import { useTranslations } from "next-intl";
import type { MatchReason } from "@/domain/match-reason";
import type { CandidatureStatus } from "@/domain/enums";
import { useState } from "react";
import { Bot, Hand, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CandidatureRow {
  id: string;
  projectTitle: string;
  status: CandidatureStatus;
  source: string;
  score: number | null;
  reasons: MatchReason[];
  rateEuros: number | null;
  appliedAt: string;
  auto: boolean;
}

/**
 * Filter tabs. The label is looked up from `key` rather than carried here:
 * a literal in a module-level constant is invisible to the leak scan, which
 * only reads JSX, and these five stayed French through a full i18n pass.
 */
const GROUPS: { key: string; match: (s: string) => boolean }[] = [
  { key: "all", match: () => true },
  { key: "sent", match: (s) => s === "NEW" },
  {
    key: "short",
    match: (s) =>
      ["SHORTLISTED", "STARRED", "INVITED", "SELFTAPE_REQUESTED"].includes(s),
  },
  { key: "won", match: (s) => s === "CONTRACTED" },
  { key: "closed", match: (s) => ["REJECTED", "EXCLUDED"].includes(s) },
];

function statusVariant(s: string) {
  if (["CONTRACTED", "STARRED", "INVITED"].includes(s)) return "success" as const;
  if (["SHORTLISTED", "SELFTAPE_REQUESTED"].includes(s)) return "accent" as const;
  if (["REJECTED", "EXCLUDED"].includes(s)) return "neutral" as const;
  return "warning" as const;
}

export function CandidaturesList({ rows }: { rows: CandidatureRow[] }) {
  const t = useTranslations("talents");
  const ta = useTranslations("app");
  const [tab, setTab] = useState("all");
  const group = GROUPS.find((g) => g.key === tab)!;
  const filtered = rows.filter((r) => group.match(r.status));

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap">
        {GROUPS.map((g) => (
          <TabsTrigger key={g.key} value={g.key}>
            {t(`space.candidatures.groups.${g.key}` as "space.candidatures.groups.all")}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={tab}>
        {filtered.length === 0 ? (
          <p className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-8 text-center text-sm text-fg-muted">{t("space.candidatures.emptyList")}</p>
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
                      {t(`space.candidatures.status.${r.status}`)}
                    </Badge>
                    <Badge variant="neutral">
                      {r.auto ? <Bot /> : <Hand />}
                      {t(
                        r.auto
                          ? "space.candidatures.origin.auto"
                          : "space.candidatures.origin.manual"
                      )}
                    </Badge>
                  </div>
                  {r.reasons.length > 0 && (
                    <p className="mt-1 text-xs text-fg-muted">
                      {r.reasons
                        .map((x) => ta(`matchReasons.${x.key}`, x.values))
                        .join(" · ")}
                    </p>
                  )}
                </div>
                {r.rateEuros != null && (
                  <div className="flex items-center gap-1 text-sm text-fg-muted">
                    <MapPin className="size-3.5" />
                    {t("space.candidatures.ratePerDay", { amount: r.rateEuros })}
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
