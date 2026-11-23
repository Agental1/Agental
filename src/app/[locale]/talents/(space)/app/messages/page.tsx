import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { getMyThread, listMyConversations } from "@/lib/messages";
import { AgentFindPreview } from "@/components/talents/agent-find-preview";
import { agentDisplayName, agentSetupOf, nameInitial } from "@/domain/agent-setup";
import { ConversationList, ThreadScroller } from "@/components/app/conversations";
import { prisma } from "@/lib/db";
import { MessageList } from "@/components/app/message-list";
import { MarkThreadRead, MessageComposer } from "@/components/app/message-composer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: toLocale(locale), namespace: "talents" });
  return { title: t("space.messages.title") };
}

/**
 * Messages: the performer's conversations with the Agental team (several since
 * round 8d: "New conversation", a list, delete for the performer), under
 * the AI agent setup (saved on the account since round 8b; not live). People answer here; nothing in this page talks
 * to a model.
 */
export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { locale: rawLocale } = await params;
  const rawC = (await searchParams).c;
  const wanted = typeof rawC === "string" && rawC.length <= 40 ? rawC : null;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;

  const [{ threadId, messages, waitingForTeam }, conversations, agent] = await Promise.all([
    getMyThread(session.user.id, undefined, wanted),
    listMyConversations(session.user.id),
    prisma.artistProfile.findUnique({
      where: { userId: session.user.id },
      select: { agentNameChoice: true, agentCustomName: true, agentHelps: true, agentSavedAt: true },
    }),
  ]);

  const setup = agent ? agentSetupOf(agent) : null;
  // "Sam" everywhere when the performer named their agent; otherwise "Agental assistant".
  const agentName = agentDisplayName(setup) ?? t("space.assistant.assistant");
  const isNew = wanted === "new" || threadId === null;
  const active = conversations.find((c) => c.threadId === threadId);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const m = "space.messages" as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.messages.title")}</h1>
        <p className="text-fg-muted">{t("space.messages.subtitle")}</p>
      </div>
      <AgentFindPreview saved={setup} />

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <ConversationList
        rows={conversations.map((c) => ({ threadId: c.threadId, title: c.title, date: day.format(c.at) }))}
        activeId={threadId}
        isNew={isNew}
        labels={{
          heading: t(`${m}.conversations`),
          newConversation: t(`${m}.newConversation`),
          untitled: t(`${m}.untitled`),
          menu: t(`${m}.conversationMenu`),
          delete: t(`${m}.deleteConversation`),
          confirmTitle: t(`${m}.deleteConfirmTitle`),
          confirmBody: t(`${m}.deleteConfirmBody`),
          cancel: t(`${m}.cancel`),
          deleted: t(`${m}.deleted`),
          failed: t(`${m}.deleteFailed`),
        }}
      />
      <section
        aria-labelledby="team-conversation"
        className="min-w-0 overflow-hidden rounded-sedan-xl border border-border bg-surface"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent"
          >
            {nameInitial(agentName)}
          </span>
          <div className="min-w-0">
            <h2 id="team-conversation" className="font-display text-lg font-medium">
              {agentName}
            </h2>
            <p className="truncate text-xs text-fg-muted">
              {isNew ? t(`${m}.newConversation`) : (active?.title ?? t(`${m}.untitled`))} · {t("space.team.title")}
            </p>
          </div>
        </header>

        <div className="space-y-5 p-5">
          {waitingForTeam && (
            <p role="status" className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-surface-2 px-3 py-1 text-sm font-medium text-warning">
              <Clock aria-hidden="true" className="size-4" />
              {t("space.assistant.waiting")}
            </p>
          )}
          {isNew || messages.length === 0 ? (
            <div className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-6 text-center">
              <MessageSquare aria-hidden="true" className="mx-auto size-7 text-accent" />
              <p className="mt-3 font-medium">{t("space.messages.empty")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
                {t("space.team.firstMessage")}
              </p>
            </div>
          ) : (
            <ThreadScroller count={messages.length} jumpLabel={t(`${m}.jumpToLatest`)} label={agentName}>
              <MessageList
                messages={messages}
                ownSide="performer"
                teamLabel={t("space.team.title")}
                performerLabel={t("space.messages.you")}
                assistantLabel={agentName}
                avatars
                topicLabels={{ profile: t("space.assistant.topics.profile"), application: t("space.assistant.topics.application"), other: t("space.assistant.topics.other") }}
                locale={locale}
              />
            </ThreadScroller>
          )}

          <MessageComposer
            conversationId={isNew ? "new" : (threadId ?? "new")}
            labels={{
              label: t("space.messages.composerLabel"),
              placeholder: t("space.messages.placeholder"),
              send: t("space.messages.send"),
              sending: t("space.messages.sending"),
              hint: t("space.messages.repliesHere"),
              topicLegend: t("space.assistant.topicLegend"),
              topics: { profile: t("space.assistant.topics.profile"), application: t("space.assistant.topics.application"), other: t("space.assistant.topics.other") },
            }}
          />
        </div>
      </section>
      </div>
      {threadId && !isNew && <MarkThreadRead mine={threadId} />}
    </div>
  );
}
