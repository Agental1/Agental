"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Radar } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import type { RoleSearchQuota } from "@/domain/role-search";
import { startFindingRoles } from "@/app/actions/role-search";
import { SearchUsageLine } from "@/components/app/search-usage";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** How long the scanning animation plays before the confirmation shows. */
const SCAN_MS = 2400;

function newClientKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * "Start finding roles": a large round green button on the Talent dashboard,
 * with the AI searches left under it. A click stores a queued request on the
 * server (quota checked there) while the button turns into a radar for a
 * couple of seconds, then says the agent is looking. At 0 left, the button is
 * disabled and points to the plan switcher.
 */
export function FindRolesButton({
  initialQuota,
  upgradeHref,
  locked,
}: {
  initialQuota: RoleSearchQuota;
  upgradeHref: string;
  /**
   * Round 8: before 100%, the button opens a dialog instead of searching. The
   * first search starts on its own at 100% (verified email); `more` is how many
   * the performer can then launch this period (the plan's allowance minus it).
   */
  locked?: { href: string; more: number };
}) {
  const t = useTranslations("talents.space.dashboard.findRoles");
  const router = useRouter();
  const [quota, setQuota] = useState(initialQuota);
  const [phase, setPhase] = useState<"idle" | "scanning" | "sent">("idle");
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  // One key per attempt: a double click reuses it, so the server stores one row.
  const keyRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const [lockOpen, setLockOpen] = useState(false);
  const exhausted = !locked && quota.remaining <= 0;
  const busy = pending || phase === "scanning";

  function click() {
    if (locked) return setLockOpen(true);
    if (busy || exhausted) return;
    setError(undefined);
    keyRef.current ??= newClientKey();
    setPhase("scanning");
    const startedAt = Date.now();
    start(async () => {
      let res;
      try {
        res = await startFindingRoles(keyRef.current!);
      } catch {
        res = { ok: false as const, error: err("errors.generic") };
      }
      if (!res.ok) {
        setPhase("idle");
        setError(res.error);
        if (res.quota) setQuota(res.quota);
        if (res.error.key !== "errors.generic") keyRef.current = null;
        return;
      }
      keyRef.current = null;
      setQuota(res.quota);
      const wait = Math.max(0, SCAN_MS - (Date.now() - startedAt));
      timer.current = setTimeout(() => {
        setPhase("sent");
        router.refresh();
      }, wait);
    });
  }

  return (
    <section
      id="find-roles"
      aria-labelledby="find-roles-title"
      className="flex scroll-mt-24 flex-col items-center gap-4 rounded-sedan-xl border border-border bg-surface px-5 py-8 text-center"
    >
      <h2 id="find-roles-title" className="sr-only">
        {t("label")}
      </h2>
      <div className="relative flex size-44 items-center justify-center sm:size-48">
        {phase === "scanning" && (
          <span aria-hidden="true">
            <span className="radar-ring" />
            <span className="radar-ring" />
            <span className="radar-ring" />
          </span>
        )}
        <button
          type="button"
          onClick={click}
          disabled={exhausted || busy}
          aria-busy={busy}
          aria-describedby="find-roles-left"
          className={cn(
            "pressable relative flex size-full flex-col items-center justify-center gap-2 rounded-full px-6 text-[1.25rem] font-bold leading-tight shadow-lg [--hover-scale:1.03] [--press-scale:0.97]",
            "bg-[var(--go)] text-[var(--go-fg)]",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--go)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "disabled:cursor-not-allowed",
            exhausted && "bg-surface-2 text-fg-muted shadow-none"
          )}
        >
          <Radar
            aria-hidden="true"
            className={cn("size-8", phase === "scanning" && "radar-sweep")}
          />
          {phase === "scanning" ? t("scanning") : t("label")}
        </button>
      </div>

      <p id="find-roles-left" className="text-sm font-medium text-fg-muted">
        <SearchUsageLine quota={quota} />
      </p>

      <div aria-live="polite" className="min-h-6 max-w-md">
        {phase === "sent" && <p className="text-[15px] font-medium">{t("sent")}</p>}
      </div>

      {exhausted && (
        <Link href={upgradeHref} className="text-sm font-bold text-accent hover:underline">
          {t("upgradeMore")}
        </Link>
      )}
      <ActionErrorMessage error={error} />
      {locked && (
        <Dialog open={lockOpen} onOpenChange={setLockOpen}>
          <DialogContent data-portal="talents">
            <DialogHeader>
              <DialogTitle>{t("locked.title")}</DialogTitle>
              <DialogDescription>{t("locked.body", { more: locked.more })}</DialogDescription>
            </DialogHeader>
            <Button asChild className="self-start">
              <Link href={locked.href} onClick={() => setLockOpen(false)}>
                {t("locked.cta")}
              </Link>
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
