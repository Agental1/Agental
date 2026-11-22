"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import type { MySearchStatus } from "@/lib/role-search";

/** How often the block asks for fresh counts while the tab is visible. */
const REFRESH_MS = 30_000;

/** Where each count opens Applications. */
const STATUS_HREF = {
  queued: "/talents/app/candidatures?view=queue",
  running: "/talents/app/candidatures?view=running",
  finished: "/talents/app/candidatures?view=finished",
  rolesFound: "/talents/app/candidatures?view=finished",
} as const;

/**
 * The bottom of the "Start finding roles" card (round 8b): a Status line with
 * the real counts (searches in queue, running, finished, roles found), each
 * one a link to its section of Applications, and "Check your applications" at
 * the bottom right. The counts refresh by themselves, and right after a new
 * search (the button sends "agental:search-started").
 */
export function SearchStatus({ initial }: { initial: MySearchStatus }) {
  const t = useTranslations("talents.space.dashboard.status");
  const [s, setS] = useState(initial);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/role-searches/status", { cache: "no-store" });
      if (res.ok) setS((await res.json()) as MySearchStatus);
    } catch {
      // Offline: keep what is shown.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onStart = () => void load();
    window.addEventListener("agental:search-started", onStart);
    document.addEventListener("visibilitychange", onStart);
    return () => {
      clearInterval(timer);
      window.removeEventListener("agental:search-started", onStart);
      document.removeEventListener("visibilitychange", onStart);
    };
  }, [load]);

  const items = [
    { key: "queued", label: t("queued", { count: s.queued }) },
    { key: "running", label: t("running", { count: s.running }) },
    { key: "finished", label: t("finished", { count: s.finished }) },
    { key: "rolesFound", label: t("rolesFound", { count: s.rolesFound }) },
  ] as const;

  return (
    <div className="mt-2 flex w-full flex-col items-stretch gap-3 border-t border-border pt-4 sm:items-end">
      <div className="text-left sm:text-right" aria-live="polite">
        <p className="text-[13px] font-bold uppercase tracking-wide text-fg-muted">{t("title")}</p>
        <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[15px] sm:justify-end">
          {items.map((it, i) => (
            <span key={it.key} className="inline-flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden="true" className="text-fg-subtle">
                  ·
                </span>
              )}
              <Link href={STATUS_HREF[it.key]} className="font-medium underline-offset-4 hover:text-accent hover:underline">
                {it.label}
              </Link>
            </span>
          ))}
        </p>
      </div>
      <Button asChild variant="outline" className="self-start sm:self-end">
        <Link href="/talents/app/candidatures">
          {t("check")} <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
