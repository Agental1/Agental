"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, Megaphone, MessageSquare, Send, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";

type Kind = "ROLE_FOUND" | "MESSAGE" | "STATUS" | "UPDATE" | "ALERT";
interface Item {
  key: string;
  kind: Kind;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const ICONS: Record<Kind, LucideIcon> = {
  ROLE_FOUND: Sparkles,
  MESSAGE: MessageSquare,
  ALERT: TriangleAlert,
  STATUS: Send,
  UPDATE: Megaphone,
};

/**
 * How often the bell asks for news. Since round 8c a Supabase Realtime signal
 * reloads it at once when a notification arrives; this refresh stays as the
 * fallback (Realtime not configured, socket down, announcements).
 */
const REFRESH_MS = 60_000;

/**
 * Listen for "something new" on this person's private bell topic and call
 * `onSignal` each time. Returns a stop function. Does nothing when the server
 * says Realtime is not configured. No notification content comes over the
 * socket: the bell reloads through /api/notifications.
 */
function listenForNotifications(onSignal: () => void): () => void {
  let stopped = false;
  let stop = () => {};
  let renew: ReturnType<typeof setTimeout> | undefined;
  type TokenAnswer = { url: string; anonKey: string; token: string; topic: string; expiresAt: string };
  const fetchToken = async (): Promise<TokenAnswer | null> => {
    try {
      const res = await fetch("/api/realtime/token", { cache: "no-store" });
      return res.ok ? ((await res.json()) as TokenAnswer) : null;
    } catch {
      return null;
    }
  };
  void (async () => {
    const first = await fetchToken();
    if (!first || stopped) return;
    const { RealtimeClient } = await import("@supabase/realtime-js");
    if (stopped) return;
    const client = new RealtimeClient(`${first.url.replace(/^http/, "ws")}/realtime/v1`, {
      params: { apikey: first.anonKey },
    });
    await client.setAuth(first.token);
    // One reload for a burst of signals (a search can add several rows at once).
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const signal = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(onSignal, 1500);
    };
    const refreshAuth = async () => {
      const next = await fetchToken();
      if (next && !stopped) await client.setAuth(next.token);
      return next;
    };
    const channel = client.channel(first.topic, { config: { private: true } });
    channel.on("broadcast", { event: "notification" }, signal).subscribe((status) => {
      // After a sleep past the token's hour, the rejoin fails: a fresh token
      // lets the client's own retry succeed. The 60-second refresh covers the gap.
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") void refreshAuth();
    });
    // A new token five minutes before this one ends.
    const schedule = (expiresAt: string) => {
      const wait = Math.max(60_000, new Date(expiresAt).getTime() - Date.now() - 5 * 60_000);
      renew = setTimeout(async () => {
        const next = await fetchToken();
        if (stopped) return;
        if (next) {
          await client.setAuth(next.token);
          schedule(next.expiresAt);
        } else schedule(new Date(Date.now() + 10 * 60_000).toISOString());
      }, wait);
    };
    schedule(first.expiresAt);
    stop = () => {
      if (debounce) clearTimeout(debounce);
      void client.removeAllChannels();
      client.disconnect();
    };
    if (stopped) stop();
  })().catch(() => {
    // Realtime is a bonus: the 60-second refresh keeps working.
  });
  return () => {
    stopped = true;
    if (renew) clearTimeout(renew);
    stop();
  };
}

/**
 * The notification bell in the app header (round 8): a badge with the unread
 * count, and a panel with the latest items (roles found, messages, audition
 * updates, product updates), "Mark all as read", and a link on each item.
 * In-app only.
 */
export function NotificationBell({ portal }: { portal: Portal }) {
  const t = useTranslations("common.app.bell");
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // The server's clock at the last load, so "5 minutes ago" stays pure.
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Item[]; unread: number; now: string };
      setItems(data.items);
      setUnread(data.unread);
      setNow(new Date(data.now).getTime());
    } catch {
      // Offline: keep what is shown.
    }
  }, []);

  useEffect(() => {
    // First load on mount, then every minute while the tab is visible.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const stopListening = listenForNotifications(() => void load());
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      stopListening();
    };
  }, [load]);

  async function post(body: object) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  }

  function markAll() {
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    setUnread(0);
    void post({ all: true });
  }

  function openItem(item: Item) {
    if (!item.read) {
      setItems((list) => list.map((i) => (i.key === item.key ? { ...i, read: true } : i)));
      setUnread((n) => Math.max(0, n - 1));
      void post({ key: item.key });
    }
    setOpen(false);
  }

  const when = (iso: string) => {
    const minutes = Math.round(((now ?? new Date(iso).getTime()) - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (minutes < 60) return rtf.format(-Math.max(0, minutes), "minute");
    if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
    return rtf.format(-Math.round(minutes / 1440), "day");
  };

  const title = (item: Item) => {
    const role = typeof item.payload.role === "string" ? item.payload.role : "";
    if (item.kind === "ROLE_FOUND") return t("roleFound");
    if (item.kind === "MESSAGE") {
      if (item.payload.from !== "assistant") return t("teamReplied");
      const name = typeof item.payload.agentName === "string" ? item.payload.agentName : "";
      return name ? t("agentReplied", { name }) : t("assistantReplied");
    }
    if (item.kind === "STATUS") return t("statusChanged");
    // ALERT titles are written in English by the server for the admins.
    return item.title || role;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <PopoverTrigger
        aria-label={unread > 0 ? t("labelUnread", { count: unread }) : t("label")}
        className="pressable relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-fg"
      >
        <Bell aria-hidden="true" className="size-[1.125rem]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-5 text-accent-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent data-portal={portal} align="end" className="w-[min(24rem,92vw)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-bold">{t("title")}</p>
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className="text-xs font-bold text-accent hover:underline disabled:text-fg-subtle disabled:no-underline"
          >
            {t("markAll")}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto">
            {items.map((item) => {
              const Icon = ICONS[item.kind];
              const content = (
                <span className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !item.read && "font-bold")}>{title(item)}</span>
                    {item.body && <span className="line-clamp-2 block text-xs text-fg-muted">{item.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-fg-subtle">{when(item.createdAt)}</span>
                  </span>
                  {!item.read && <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
                </span>
              );
              const internal = item.link?.startsWith("/");
              return (
                <li key={item.key} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  {item.link && internal ? (
                    <Link href={item.link} onClick={() => openItem(item)} className="block">
                      {content}
                    </Link>
                  ) : item.link ? (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" onClick={() => openItem(item)} className="block">
                      {content}
                    </a>
                  ) : (
                    <button type="button" onClick={() => openItem(item)} className="block w-full text-left">
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
