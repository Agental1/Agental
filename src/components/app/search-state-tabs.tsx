"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SEARCH_VIEWS, type SearchView } from "@/domain/search-view";

/**
 * The top of Applications (round 8c): three buttons, "Search in queue",
 * "Search in progress" and "Search finished", each with its count. The
 * button pressed shows its list below. The dashboard Status line opens the
 * page on the matching button (?view=queue|running|finished); the choice
 * stays in the address so a reload or a shared link keeps it.
 */
export function SearchStateTabs({
  initial,
  counts,
  panels,
}: {
  initial: SearchView;
  counts: Record<SearchView, number>;
  panels: Record<SearchView, React.ReactNode>;
}) {
  const t = useTranslations("talents.space.candidatures");
  const [view, setView] = useState<SearchView>(initial);

  function choose(v: SearchView) {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }

  const label: Record<SearchView, string> = {
    queue: t("queue.title"),
    running: t("running.title"),
    finished: t("finished.title"),
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("states.label")} className="grid gap-2 sm:grid-cols-3">
        {SEARCH_VIEWS.map((v) => {
          const on = v === view;
          return (
            <button
              key={v}
              id={`search-tab-${v}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`search-panel-${v}`}
              onClick={() => choose(v)}
              className={cn(
                "flex min-h-12 items-center justify-center gap-2 rounded-sedan border px-4 py-2.5 text-[15px] font-bold transition-colors",
                on
                  ? "border-accent bg-accent text-accent-fg shadow-sm"
                  : "border-border bg-surface hover:border-accent hover:text-accent-ink"
              )}
            >
              <span>{label[v]}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{counts[v]}</span>
            </button>
          );
        })}
      </div>
      {SEARCH_VIEWS.map((v) => (
        <div
          key={v}
          id={`search-panel-${v}`}
          role="tabpanel"
          aria-labelledby={`search-tab-${v}`}
          hidden={v !== view}
        >
          {panels[v]}
        </div>
      ))}
    </div>
  );
}
