"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Hourglass, Radar, RefreshCw } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  clampScore,
  groupByLane,
  LANES,
  meterPercent,
  needsPolling,
  type BoardSearch,
  type Lane,
} from "@/domain/search-board";
import type { MySearchStatus } from "@/lib/role-search";
import { cn } from "@/lib/utils";

/** How often the board checks for a change while something is queued or running. */
const POLL_MS = 15_000;

export interface BoardMatch {
  id: string;
  title: string;
  score: number | null;
}

const LANE_ICON = { queued: Hourglass, running: Radar, done: Check } as const;

/** A match score as a ring, with the number as text (the ring is decoration). */
export function MatchRing({ score, label }: { score: number; label: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-12 shrink-0 items-center justify-center" role="img" aria-label={label}>
      <svg viewBox="0 0 44 44" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-accent-soft" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className="board-ring-arc stroke-accent"
        />
      </svg>
      <span aria-hidden="true" className="absolute text-[13px] font-bold">
        {score}
      </span>
    </span>
  );
}

/**
 * Round 12 g5: the searches as a live board. Queued, Running, Done lanes (stacked on
 * small screens); a card glides to its new lane when the status changes. While
 * something is queued or running, the board asks the existing status endpoint
 * and refreshes the page data only when a count changed. The allowance is a
 * used / total meter, and the best matches show a ring with their score.
 */
export function SearchBoard({
  searches,
  limit,
  held,
  agent,
  matches,
  counts,
}: {
  searches: BoardSearch[];
  limit: number;
  held: number;
  agent: string;
  matches: BoardMatch[];
  /** The counts the server rendered, to tell when the status endpoint changed. */
  counts: { queued: number; running: number; finished: number };
}) {
  const t = useTranslations("talents.space.dashboard.board");
  const locale = useLocale();
  const router = useRouter();
  const lanes = groupByLane(searches);
  const [refreshing, startRefresh] = useTransition();
  const [failed, setFailed] = useState(false);
  const known = useRef(counts);
  known.current = counts;

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/role-searches/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      const s = (await res.json()) as MySearchStatus;
      setFailed(false);
      const k = known.current;
      if (s.queued !== k.queued || s.running !== k.running || s.finished !== k.finished) {
        startRefresh(() => router.refresh());
      }
    } catch {
      setFailed(true);
    }
  }, [router]);

  const active = needsPolling(lanes);
  useEffect(() => {
    const onStart = () => void poll();
    window.addEventListener("agental:search-started", onStart);
    if (!active) return () => window.removeEventListener("agental:search-started", onStart);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      window.removeEventListener("agental:search-started", onStart);
    };
  }, [active, poll]);

  // Glide a card from its old place to its new one (Web Animations, no library).
  const els = useRef(new Map<string, HTMLElement>());
  const rects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();
    els.current.forEach((el, id) => {
      const now = el.getBoundingClientRect();
      next.set(id, now);
      const before = rects.current.get(id);
      if (!reduce && before && (before.left !== now.left || before.top !== now.top) && el.animate) {
        el.animate(
          [{ transform: `translate(${before.left - now.left}px, ${before.top - now.top}px)` }, { transform: "none" }],
          { duration: 500, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
        );
      }
    });
    rects.current = next;
  });

  const setEl = (id: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };

  const pct = meterPercent(held, limit);
  const empty = searches.length === 0;
  const time = (iso: string | null) =>
    iso ? (
      <time dateTime={iso} suppressHydrationWarning>
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso))}
      </time>
    ) : null;

  return (
    <section
      aria-labelledby="search-board-title"
      aria-busy={refreshing}
      className="space-y-5 rounded-sedan-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="search-board-title" className="font-display text-xl font-medium">
            {t("title")}
          </h2>
          <p className="text-sm text-fg-muted">
            {t("byAgent", { agent })}{" "}
            <Link href="/talents/app/messages" className="font-medium text-accent-ink underline-offset-4 hover:underline">
              {t("rename", { agent })}
            </Link>
          </p>
        </div>
        <div className="w-full max-w-xs sm:w-64">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{t("meter.title")}</span>
            <span className="text-fg-muted">{t("meter.text", { used: held, total: limit })}</span>
          </div>
          <div
            role="meter"
            aria-label={t("meter.title")}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(held, limit)}
            aria-valuetext={t("meter.text", { used: held, total: limit })}
            className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-accent-soft"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {failed && (
        <p role="alert" className="flex flex-wrap items-center gap-3 rounded-sedan border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          {t("error")}
          <Button size="sm" variant="outline" onClick={() => void poll()}>
            <RefreshCw /> {t("retry")}
          </Button>
        </p>
      )}

      {empty ? (
        <p className="rounded-sedan border border-dashed border-border px-4 py-6 text-center text-[15px]">
          {t("empty", { agent })}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {LANES.map((lane: Lane) => {
            const Icon = LANE_ICON[lane];
            const items = lanes[lane];
            return (
              <div key={lane} role="group" aria-label={t(`lane.${lane}`)} className="rounded-sedan bg-surface-2/60 p-3">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <Icon aria-hidden="true" className={cn("size-4 text-accent", lane === "running" && items.length > 0 && "radar-sweep")} />
                  {t(`lane.${lane}`)}
                  <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted">{items.length}</span>
                </h3>
                {items.length === 0 ? (
                  <p className="px-1 py-3 text-sm text-fg-muted">{t(`laneEmpty.${lane}`)}</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((s, i) => (
                      <li
                        key={s.id}
                        ref={setEl(s.id)}
                        className={cn(
                          "board-card rounded-sedan border bg-surface p-3 text-sm",
                          lane === "running" ? "border-accent/50" : "border-border"
                        )}
                      >
                        <p className="font-medium">
                          {lane === "queued" && (i === 0 ? t("card.next") : t("card.inLine", { n: i + 1 }))}
                          {lane === "running" && t("card.running", { agent })}
                          {lane === "done" && t("card.done")}
                        </p>
                        <p className="text-fg-muted">
                          {lane === "queued" && time(s.scheduledFor ?? s.createdAt)}
                          {lane === "running" && time(s.startedAt ?? s.createdAt)}
                          {lane === "done" && time(s.completedAt ?? s.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {matches.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold">{t("matches.title")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => {
              const score = clampScore(m.score);
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-3">
                  {score !== null && <MatchRing score={score} label={t("matches.score", { score })} />}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.title}</p>
                    {score !== null && <p className="text-sm text-fg-muted">{t("matches.score", { score })}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Button asChild variant="outline" size="sm">
        <Link href="/talents/app/candidatures">
          {t("viewAll")} <ArrowRight />
        </Link>
      </Button>
    </section>
  );
}
