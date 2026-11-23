"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteMyConversation } from "@/app/actions/messages";

const MESSAGES_PATH = "/talents/app/messages";

export interface ConversationRow {
  threadId: string;
  title: string | null;
  /** Already formatted for the page's locale. */
  date: string;
}

export interface ConversationLabels {
  heading: string;
  newConversation: string;
  untitled: string;
  menu: string;
  delete: string;
  confirmTitle: string;
  confirmBody: string;
  cancel: string;
  deleted: string;
  failed: string;
}

/**
 * Round 8d: the performer's conversations with "New conversation" on top.
 * Each row has a small menu with "Delete conversation", behind a
 * confirmation. A deleted conversation leaves the list at once.
 */
export function ConversationList({
  rows,
  activeId,
  isNew,
  labels,
}: {
  rows: ConversationRow[];
  activeId: string | null;
  isNew: boolean;
  labels: ConversationLabels;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<ConversationRow | null>(null);
  const [, start] = useTransition();

  function remove(row: ConversationRow) {
    setHidden((h) => new Set(h).add(row.threadId));
    start(async () => {
      const res = await deleteMyConversation(row.threadId).catch(() => null);
      if (!res?.ok) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(row.threadId);
          return next;
        });
        toast.error(labels.failed);
        return;
      }
      toast.success(labels.deleted);
      if (row.threadId === activeId) router.replace(MESSAGES_PATH);
      else router.refresh();
    });
  }

  const visible = rows.filter((r) => !hidden.has(r.threadId));

  return (
    <nav aria-label={labels.heading} className="space-y-3">
      <Button asChild variant={isNew ? "primary" : "outline"} className="w-full justify-center">
        <Link href={{ pathname: MESSAGES_PATH, query: { c: "new" } }}>
          <Plus aria-hidden="true" />
          {labels.newConversation}
        </Link>
      </Button>
      {visible.length > 0 && (
        <div>
          <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-fg-muted">{labels.heading}</h2>
          <ul className="mt-2 space-y-1">
            {visible.map((row) => {
              const active = !isNew && row.threadId === activeId;
              return (
                <li
                  key={row.threadId}
                  className={cn(
                    "group flex items-center gap-1 rounded-sedan border",
                    active ? "border-accent/50 bg-accent-soft/50" : "border-transparent hover:bg-surface-2"
                  )}
                >
                  <Link
                    href={{ pathname: MESSAGES_PATH, query: { c: row.threadId } }}
                    aria-current={active ? "page" : undefined}
                    className="min-w-0 flex-1 px-3 py-2"
                  >
                    <span className="block truncate text-sm font-medium">{row.title ?? labels.untitled}</span>
                    <span className="block text-xs text-fg-muted">{row.date}</span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`${labels.menu}: ${row.title ?? labels.untitled}`}
                      className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setConfirming(row)} className="text-danger">
                        <Trash2 aria-hidden="true" className="size-4" />
                        {labels.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent data-portal="talents">
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{labels.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirming) remove(confirming);
                setConfirming(null);
              }}
            >
              {labels.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}

/** How far from the bottom (px) still counts as "at the latest message". */
const NEAR_BOTTOM = 120;

/**
 * Round 8d: the thread scrolls in its own box with a scrollbar that stays
 * visible on the right (`.thread-scroll` in globals.css), opens on the newest
 * message, and offers "Jump to latest" once the person has scrolled up.
 */
export function ThreadScroller({
  children,
  count,
  jumpLabel,
  label,
}: {
  children: React.ReactNode;
  /** The number of messages: a new one scrolls down when the reader was at the bottom. */
  count: number;
  jumpLabel: string;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const atBottom = useRef(true);

  const toBottom = useCallback((smooth: boolean) => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Open on the newest message, and follow new ones while at the bottom.
  useEffect(() => {
    if (atBottom.current) toBottom(false);
  }, [count, toBottom]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    atBottom.current = near;
    setAway(!near);
  }

  return (
    <div className="relative">
      <div
        ref={box}
        onScroll={onScroll}
        tabIndex={0}
        role="region"
        aria-label={label}
        className="thread-scroll max-h-[60vh] min-h-40 overflow-y-auto pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {children}
      </div>
      {away && (
        <button
          type="button"
          onClick={() => toBottom(true)}
          className="absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-bold shadow-md hover:border-accent"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
          {jumpLabel}
        </button>
      )}
    </div>
  );
}
