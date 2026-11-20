import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getTeamThread, isTeamMember, listTeamThreads } from "@/lib/messages";
import { MessageList } from "@/components/app/message-list";
import { MarkThreadRead, MessageComposer } from "@/components/app/message-composer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "app" });
  return { title: `Bang · ${t("admin.nav.messages")}` };
}

/**
 * The team inbox: every performer's conversation with the Agental team, and
 * the open one (?thread=) with a reply composer. Admins only; the layout
 * redirects everyone else and the reads below check again.
 */
export default async function AdminMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ thread?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });

  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId || !(await isTeamMember(viewerId))) notFound();

  const rawThread = (await searchParams).thread;
  const threadParam = typeof rawThread === "string" && rawThread.length <= 100 ? rawThread : null;

  const threads = await listTeamThreads(viewerId);
  const open = threadParam ? await getTeamThread(viewerId, threadParam) : null;
  const performerName = open ? (open.user.name?.trim() || open.user.email) : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("admin.messages.title")}</h1>
        <p className="text-fg-muted">{t("admin.messages.subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section aria-labelledby="inbox" className={cn(open && "hidden lg:block")}>
          <h2 id="inbox" className="sr-only">
            {t("admin.messages.inbox")}
          </h2>
          {threads.length === 0 ? (
            <div className="rounded-sedan border border-dashed border-border bg-surface/60 p-8 text-center">
              <MessageSquare aria-hidden="true" className="mx-auto size-7 text-accent" />
              <p className="mt-3 text-sm text-fg-muted">{t("admin.messages.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-sedan border border-border bg-surface">
              {threads.map((row) => {
                const active = open?.threadId === row.threadId;
                return (
                  <li key={row.threadId}>
                    <Link
                      href={{ pathname: "/admin/messages", query: { thread: row.threadId } }}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "block p-4 transition-colors hover:bg-surface-2/60",
                        active && "bg-accent-soft/50"
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">
                          {row.user.name?.trim() || row.user.email}
                        </span>
                        {row.lastMessageAt && (
                          <time
                            dateTime={row.lastMessageAt.toISOString()}
                            className="shrink-0 text-xs text-fg-subtle"
                          >
                            {dateTime(row.lastMessageAt, locale)}
                          </time>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-fg-muted">{row.preview}</span>
                      {(row.unread > 0 || row.awaitingReply) && (
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {row.unread > 0 && (
                            <Badge variant="accent">
                              {t("admin.messages.unread", { count: row.unread })}
                            </Badge>
                          )}
                          {row.waitingForTeam ? (
                            <Badge variant="warning">{t("admin.messages.waitingForTeam")}</Badge>
                          ) : (
                            row.awaitingReply && (
                              <Badge variant="warning">{t("admin.messages.awaitingReply")}</Badge>
                            )
                          )}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="thread-title"
          className={cn(
            "rounded-sedan border border-border bg-surface",
            !open && "hidden lg:block"
          )}
        >
          {open ? (
            <>
              <header className="border-b border-border px-5 py-4">
                <Link
                  href="/admin/messages"
                  className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-accent hover:underline lg:hidden"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" /> {t("admin.messages.back")}
                </Link>
                <h2 id="thread-title" className="font-display text-lg font-medium">
                  {performerName}
                </h2>
                <p className="text-sm text-fg-muted">{open.user.email}</p>
                {open.waitingForTeam && (
                  <Badge variant="warning" className="mt-2">
                    {t("admin.messages.waitingForTeam")}
                  </Badge>
                )}
              </header>
              <div className="space-y-5 p-5">
                <MessageList
                  messages={open.messages}
                  ownSide="team"
                  teamLabel={t("admin.messages.team")}
                  performerLabel={performerName}
                  assistantLabel={t("admin.messages.assistant")}
                  topicLabels={{ profile: t("admin.messages.topics.profile"), application: t("admin.messages.topics.application"), other: t("admin.messages.topics.other") }}
                  locale={locale}
                />
                <MessageComposer
                  key={open.threadId}
                  threadId={open.threadId}
                  labels={{
                    label: t("admin.messages.composerLabel"),
                    placeholder: t("admin.messages.placeholder"),
                    send: t("admin.messages.send"),
                    sending: t("admin.messages.sending"),
                    hint: t("admin.messages.hint"),
                  }}
                />
              </div>
              <MarkThreadRead key={open.threadId} threadId={open.threadId} />
            </>
          ) : (
            <p id="thread-title" className="p-10 text-center text-sm text-fg-muted">
              {threadParam ? t("admin.messages.notFound") : t("admin.messages.pick")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
