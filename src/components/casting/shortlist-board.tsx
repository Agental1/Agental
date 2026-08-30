"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Star,
  Ban,
  Video,
  CalendarPlus,
  MapPin,
  Check,
  Loader2,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { actOnCandidature } from "@/app/actions/brief";

export interface ShortlistCard {
  id: string;
  name: string;
  score: number | null;
  justification: string | null;
  source: "AGENTAL" | "EXTERNAL";
  status: string;
  rateEuros: number | null;
  city: string | null;
  accents: string[];
  isMinor: boolean;
  primaryMediaId: string | null;
  ficheHref: string | null;
  similar: boolean;
}

const SORTS = [
  { key: "score", label: "Score" },
  { key: "rate", label: "Tarif" },
  { key: "name", label: "Nom" },
] as const;

export function ShortlistBoard({ cards }: { cards: ShortlistCard[] }) {
  const [minScore, setMinScore] = useState(0);
  const [source, setSource] = useState<"all" | "AGENTAL" | "EXTERNAL">("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("score");

  const visible = useMemo(() => {
    let list = cards.filter(
      (c) =>
        (c.score ?? 0) >= minScore &&
        (source === "all" || c.source === source) &&
        c.status !== "EXCLUDED"
    );
    list = [...list].sort((a, b) => {
      if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
      if (sort === "rate") return (a.rateEuros ?? 0) - (b.rateEuros ?? 0);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [cards, minScore, source, sort]);

  const agental = cards.filter((c) => c.source === "AGENTAL").length;
  const external = cards.filter((c) => c.source === "EXTERNAL").length;
  const diverse = cards.filter((c) => !c.similar).length;

  return (
    <div className="space-y-4">
      {/* Diversity + provenance summary */}
      <div className="flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-surface p-4 text-sm">
        <span className="font-medium">Neutralité :</span>
        <Badge variant="solid">{agental} Agental</Badge>
        <Badge variant="neutral">{external} External</Badge>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-muted">
          Diversité : {diverse}/{cards.length} profils distincts
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-sedan border border-border bg-surface p-3">
        <span className="flex items-center gap-1.5 text-sm text-fg-muted">
          <SlidersHorizontal className="size-4" /> Filtres
        </span>
        <label className="flex items-center gap-2 text-sm">
          Score min
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
          <span className="w-8 tabular-nums">{minScore}</span>
        </label>
        <Segmented
          value={source}
          onChange={(v) => setSource(v as typeof source)}
          options={[
            { key: "all", label: "Toutes sources" },
            { key: "AGENTAL", label: "Agental" },
            { key: "EXTERNAL", label: "External" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1 text-sm">
          Trier
          <Segmented
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={SORTS.map((s) => ({ key: s.key, label: s.label }))}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-sedan border border-dashed border-border p-8 text-center text-sm text-fg-muted">
          Aucun profil ne correspond à ces filtres.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((c) => (
            <ShortlistItem key={c.id} card={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShortlistItem({ card }: { card: ShortlistCard }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(action: "star" | "exclude" | "selftape" | "invite") {
    startTransition(async () => {
      await actOnCandidature(card.id, action);
      router.refresh();
    });
  }

  const starred = card.status === "STARRED";
  const invited = card.status === "INVITED";
  const selftape = card.status === "SELFTAPE_REQUESTED";

  return (
    <li className="flex gap-4 rounded-sedan border border-border bg-surface p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="size-16 overflow-hidden rounded-sedan bg-surface-2">
          {card.primaryMediaId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/media/${card.primaryMediaId}`} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-fg-subtle">
              photo
            </div>
          )}
        </div>
        {card.score != null && (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-full border-2 font-display text-sm",
              card.score >= 90 ? "border-success text-success" : "border-accent text-accent"
            )}
          >
            {card.score}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {card.ficheHref ? (
            <Link href={card.ficheHref} className="font-medium hover:text-accent">
              {card.name}
            </Link>
          ) : (
            <span className="font-medium">{card.name}</span>
          )}
          <Badge variant={card.source === "AGENTAL" ? "solid" : "neutral"}>
            {card.source === "AGENTAL" ? "Agental" : "External"}
          </Badge>
          {card.isMinor && (
            <Badge variant="warning">
              <ShieldAlert /> Mineur
            </Badge>
          )}
          {card.similar && <Badge variant="neutral">profil similaire</Badge>}
        </div>
        {card.justification && (
          <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{card.justification}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          {card.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {card.city}
            </span>
          )}
          {card.rateEuros != null && <span className="font-medium text-fg">{card.rateEuros} €/j</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Act active={starred} pending={pending} onClick={() => act(starred ? "star" : "star")} icon={Star} label="Étoile" />
          <Act active={selftape} pending={pending} onClick={() => act("selftape")} icon={Video} label="Self-tape" />
          <Act active={invited} pending={pending} onClick={() => act("invite")} icon={CalendarPlus} label="Audition" />
          <Act pending={pending} onClick={() => act("exclude")} icon={Ban} label="Exclure" danger />
        </div>
      </div>
    </li>
  );
}

function Act({
  icon: Icon,
  label,
  onClick,
  active,
  pending,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  pending: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-sedan border px-2 py-1 text-xs transition-colors disabled:opacity-50",
        active
          ? "border-accent bg-accent-soft text-accent"
          : danger
            ? "border-border text-fg-muted hover:border-danger hover:text-danger"
            : "border-border text-fg-muted hover:border-accent hover:text-accent"
      )}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : active ? <Check className="size-3" /> : <Icon className="size-3" />}
      {label}
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-sedan border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-[calc(var(--sedan)-0.15rem)] px-2.5 py-1 text-xs transition-colors",
            value === o.key ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
