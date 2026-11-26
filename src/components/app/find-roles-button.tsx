"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Radar } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import type { RoleSearchQuota } from "@/domain/role-search";
import { startFindingRoles } from "@/app/actions/role-search";
import { SearchUsageLine } from "@/components/app/search-usage";
import { SearchScan } from "@/components/app/search-scan";
import { EmailCodeForm } from "@/components/auth/email-code";
import type { SearchBlock, SearchNotice } from "@/domain/search-block";
import { itemHref } from "@/domain/profile-tabs";
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
const SCAN_MS = 4800;

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
  initialBlock,
  email,
  footer,
  paused = false,
  agent,
  runningNow = false,
}: {
  /** Round 12 g5: the AI agent's name ("Jay" by default). */
  agent: string;
  /** A search is really running: the scan animation stays until results arrive. */
  runningNow?: boolean;
  initialQuota: RoleSearchQuota;
  /**
   * Round 10: why this account cannot search right now (one reason, from the
   * server), shown under the button and in the dialog the button opens.
   */
  initialBlock: SearchBlock | null;
  /** For "Send me a code" when the email is not verified. */
  email: string;
  /** Round 11: staff paused AI searches; the card says so before any click. */
  paused?: boolean;
  /** Round 8b: the Status block and "Check your applications", at the bottom of the card. */
  footer?: React.ReactNode;
  upgradeHref: string;
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
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const [block, setBlock] = useState<SearchBlock | null>(initialBlock);
  const [notice, setNotice] = useState<SearchNotice | undefined>();
  const [lockOpen, setLockOpen] = useState(false);
  const exhausted = block?.reason === "quota";
  const busy = pending || phase === "scanning";

  function click() {
    if (block) return setLockOpen(true);
    if (busy) return;
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
        if (res.quota) setQuota(res.quota);
        if (res.error.key !== "errors.generic") keyRef.current = null;
        if (res.block) {
          setBlock(res.block);
          setLockOpen(true);
        } else setError(res.error);
        return;
      }
      keyRef.current = null;
      setQuota(res.quota);
      setNotice(res.notice);
      const wait = Math.max(0, SCAN_MS - (Date.now() - startedAt));
      timer.current = setTimeout(() => {
        setPhase("sent");
        window.dispatchEvent(new Event("agental:search-started"));
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
          ref={goRef}
          type="button"
          onClick={click}
          disabled={busy}
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

      <p className="max-w-md text-[15px]">{t("explain", { agent, left: quota.remaining })}</p>
      <p id="find-roles-left" className="text-sm font-medium text-fg-muted">
        <SearchUsageLine quota={quota} />
      </p>

      {(phase === "scanning" || runningNow) && (
        <SearchScan agent={agent} running={runningNow && phase !== "scanning"} />
      )}

      <div aria-live="polite" className="min-h-6 max-w-md space-y-1">
        {phase === "sent" && !notice && <p className="text-[15px] font-medium">{t("sent")}</p>}
        {phase === "sent" && notice && <NoticeText notice={notice} />}
        {block && <BlockText block={block} />}
        {paused && !block && phase !== "sent" && <p className="text-[15px] font-medium">{t("notice.pausedNow")}</p>}
      </div>

      {block && block.reason !== "not_open" && block.reason !== "not_adult" && (
        <Button variant="outline" size="sm" onClick={() => setLockOpen(true)}>
          {t(`block.${block.reason}.cta`)}
        </Button>
      )}
      <ActionErrorMessage error={error} />
      {block && (
        <Dialog open={lockOpen} onOpenChange={setLockOpen}>
          <DialogContent
            data-portal="talents"
            className="w-[calc(100%-2rem)]"
            // Opened from state, not a trigger: give the focus back to the button.
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              goRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("block.title")}</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <BlockText block={block} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <BlockAction
              block={block}
              email={email}
              upgradeHref={upgradeHref}
              onDone={() => {
                setLockOpen(false);
                setBlock(null);
                router.refresh();
              }}
              onNavigate={() => setLockOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
      {footer}
    </section>
  );
}

/** The one reason, in the words the founder chose (round 10). */
function BlockText({ block }: { block: SearchBlock }) {
  const t = useTranslations("talents.space");
  const locale = useLocale();
  const b = "dashboard.findRoles.block" as const;
  switch (block.reason) {
    case "profile_incomplete":
      return (
        <p className="text-[15px] font-medium text-danger">
          {t(`${b}.profile_incomplete.text`, {
            missing: block.missing.map((m) => t(`profileEditor.missingField.${m}`)).join(", "),
          })}
        </p>
      );
    case "quota":
      return (
        <p className="text-[15px] font-medium">
          {block.nextDate
            ? t(`${b}.quota.text`, {
                limit: block.limit,
                date: new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(block.nextDate)),
              })
            : t(`${b}.quota.textNoDate`, { limit: block.limit })}
        </p>
      );
    default:
      return <p className="text-[15px] font-medium">{t(`${b}.${block.reason}.text`)}</p>;
  }
}

function NoticeText({ notice }: { notice: SearchNotice }) {
  const t = useTranslations("talents.space.dashboard.findRoles");
  const locale = useLocale();
  if (notice.kind === "waiting") return <p className="text-[15px] font-medium">{t("notice.waiting")}</p>;
  if (notice.kind === "paused") return <p className="text-[15px] font-medium">{t("notice.paused")}</p>;
  return (
    <p className="text-[15px] font-medium">
      {t("notice.queued", {
        time: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notice.startsAt)),
      })}
    </p>
  );
}

/** The action that fixes the reason, in the dialog. */
function BlockAction({
  block,
  email,
  upgradeHref,
  onDone,
  onNavigate,
}: {
  block: SearchBlock;
  email: string;
  upgradeHref: string;
  onDone: () => void;
  onNavigate: () => void;
}) {
  const t = useTranslations("talents.space.dashboard.findRoles.block");
  const [coding, setCoding] = useState(false);
  switch (block.reason) {
    case "email_unverified":
      return coding ? (
        <EmailCodeForm email={email} sendOnMount onVerified={onDone} />
      ) : (
        <Button className="self-start" onClick={() => setCoding(true)}>
          {t("email_unverified.cta")}
        </Button>
      );
    case "profile_incomplete":
      return (
        <Button asChild className="self-start">
          <Link href={itemHref(block.missing[0])} onClick={onNavigate}>
            {t("profile_incomplete.cta")}
          </Link>
        </Button>
      );
    case "quota":
      return (
        <Button asChild className="self-start">
          <Link href={upgradeHref} onClick={onNavigate}>
            {t("quota.cta")}
          </Link>
        </Button>
      );
    case "blocked":
      return (
        <Button asChild className="self-start">
          <Link href="/talents/app/messages" onClick={onNavigate}>
            {t("blocked.cta")}
          </Link>
        </Button>
      );
    default:
      return null;
  }
}
