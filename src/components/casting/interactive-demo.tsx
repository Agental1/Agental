"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, MapPin, Check, Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Talent = {
  name: string;
  score: number;
  source: "AGENTAL" | "EXTERNAL";
  reasonKey: "1" | "2" | "3" | "4";
  rate: number;
  city: string;
  available: boolean;
};

// Deterministic mock shortlist (Phase 1 demo — real scoring lands in Phase 6).
// Demo data. The reason and the rate unit are keys: this renders on the public
// casting page, which is served in three languages.
const SHORTLIST: Talent[] = [
  { name: "Yann Le Goff", score: 94, source: "AGENTAL", reasonKey: "1", rate: 480, city: "Rennes", available: true },
  { name: "Malik Benali", score: 89, source: "EXTERNAL", reasonKey: "2", rate: 520, city: "Nantes", available: true },
  { name: "Erwan Tanguy", score: 86, source: "AGENTAL", reasonKey: "3", rate: 450, city: "Brest", available: true },
  { name: "Gaël Rioux", score: 81, source: "AGENTAL", reasonKey: "4", rate: 500, city: "Lorient", available: false },
];

export function InteractiveDemo() {
  const t = useTranslations("casting.demo");
  const [generated, setGenerated] = useState(false);

  return (
    <div className="rounded-sedan border border-border bg-surface p-5 shadow-lg sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {t("roleHeader")}
      </p>

      <div className="mt-4 space-y-2">
        <label className="text-sm font-medium text-fg-muted">
          {t("briefLabel")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            defaultValue={t("roleLine")}
            aria-label={t("briefLabel")}
            className="flex-1"
          />
          <Button onClick={() => setGenerated(true)}>
            <Sparkles /> {t("generate")}
          </Button>
        </div>
      </div>

      {generated && (
        <div className="mt-5 space-y-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span className="font-display text-2xl text-fg">1 240</span>
            {t("reviewed")}
            <ArrowRight className="size-4 text-fg-subtle" />
            <Badge variant="accent">{t("retained", { count: 18 })}</Badge>
          </p>

          <ul className="space-y-2">
            {SHORTLIST.map((talent) => (
              <li
                key={talent.name}
                className="flex items-center gap-4 rounded-sedan border border-border bg-surface-2/60 p-3"
              >
                <ScoreRing score={talent.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{talent.name}</span>
                    <Badge
                      variant={talent.source === "AGENTAL" ? "solid" : "neutral"}
                    >
                      {talent.source === "AGENTAL"
                        ? t("sourceAgental")
                        : t("sourceExternal")}
                    </Badge>
                    {talent.available && (
                      <Badge variant="success">
                        <Check /> dispo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {t(`reasons.${talent.reasonKey}`)}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-fg-muted sm:block">
                  <div className="flex items-center justify-end gap-1">
                    <MapPin className="size-3" />
                    {talent.city}
                  </div>
                  <div className="mt-0.5 font-medium text-fg">{t("perDay", { amount: talent.rate })}</div>
                </div>
                <button
                  className="shrink-0 rounded-sedan p-2 text-fg-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                  aria-label={t("favourite")}
                >
                  <Star className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
