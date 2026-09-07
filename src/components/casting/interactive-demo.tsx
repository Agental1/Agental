"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, ScanSearch, User, Star, ArrowRight, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { integer } from "@/lib/format";

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

const REVIEWED = 1240;
const RETAINED = 18;

export function InteractiveDemo() {
  const t = useTranslations("casting.demo");
  const locale = useLocale();
  const [generated, setGenerated] = useState(false);

  return (
    <div className="overflow-hidden rounded-sedan-2xl border border-border bg-surface shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <div className="px-[clamp(16px,3vw,20px)] pb-4 pt-[clamp(16px,3vw,20px)]">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-subtle">
          {t("roleHeader")}
        </p>
        <p className="mt-1 text-[16px] font-bold tracking-[-0.01em]">
          {t("roleLine")}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
        <>
          {/* Bandeau de résultat : le fond n'est pas décoratif, il sépare le
              brief de la sélection qu'il a produite. */}
          <div className="flex items-center gap-2.5 border-y border-border bg-accent/[0.06] px-[clamp(16px,3vw,20px)] py-3">
            <ScanSearch className="size-[18px] shrink-0 text-accent" />
            <p className="font-mono text-[12px] text-fg">
              <span className="font-bold text-accent">
                {integer(REVIEWED, locale)}
              </span>{" "}
              {t("reviewed")} <ArrowRight className="inline size-3.5" />{" "}
              <span className="font-bold text-accent">
                {t("retained", { count: RETAINED })}
              </span>
            </p>
          </div>

          <ul className="flex flex-col gap-2.5 p-[clamp(14px,3vw,18px)]">
            {SHORTLIST.map((talent) => (
              <li
                key={talent.name}
                className="flex items-center gap-3 rounded-sedan border border-border bg-surface-2 p-3"
              >
                {/* Carré neutre, jamais un portrait : ces noms sont fictifs, et
                    coller un vrai visage à côté ferait croire à une personne
                    réelle. La maquette fait le même choix. */}
                <span className="flex size-[42px] shrink-0 items-center justify-center rounded-sedan-sm bg-accent-2/60 text-fg/70">
                  <User className="size-[19px]" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-bold">{talent.name}</span>
                    <SourceChip source={talent.source} label={
                      talent.source === "AGENTAL"
                        ? t("sourceAgental")
                        : t("sourceExternal")
                    } />
                    {/* La disponibilité portait un littéral français en dur
                        avant le restyle, donc /en et /es affichaient « dispo ».
                        Elle passe par une clé comme le reste de la ligne. */}
                    {talent.available && (
                      <span className="flex items-center gap-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.05em] text-success">
                        <Check className="size-3" />
                        {t("available")}
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "mt-1 truncate font-mono text-[10px]",
                      talent.source === "AGENTAL" ? "text-accent" : "text-fg-muted"
                    )}
                  >
                    {t(`reasons.${talent.reasonKey}`)}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="flex items-center justify-end gap-1 font-mono text-[10px] text-fg-muted">
                    <MapPin className="size-3" />
                    {talent.city}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] font-medium text-fg">
                    {t("perDay", { amount: talent.rate })}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-mono text-[20px] font-bold leading-none">
                    {talent.score}
                  </p>
                  {/* Redondance visuelle du chiffre juste au-dessus : masquée
                      aux lecteurs d'écran, qui l'annonceraient deux fois par
                      ligne. Elle garde son budget de 3:1 (3,79:1 entre la barre
                      et sa piste) parce qu'elle reste porteuse de sens à l'œil. */}
                  <div
                    className="mt-1.5 h-1 w-10 overflow-hidden rounded-full bg-fg/15"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${talent.score}%` }}
                    />
                  </div>
                </div>

                <button
                  className="shrink-0 rounded-sedan-sm p-2 text-fg-subtle transition-colors hover:bg-accent-soft hover:text-accent"
                  aria-label={t("favourite")}
                >
                  <Star className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Provenance chip. The whole neutrality argument of this portal rests on this
 * label being visible on every row, so it gets its own contrast budget: crème
 * on either tint clears 7.7:1, where the muted role would have sat at 4.73.
 */
function SourceChip({
  source,
  label,
}: {
  source: Talent["source"];
  label: string;
}) {
  return (
    <span
      className={cn(
        "rounded-sedan-sm px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.05em] text-fg",
        source === "AGENTAL" ? "bg-success/25" : "bg-fg/10"
      )}
    >
      {label}
    </span>
  );
}
