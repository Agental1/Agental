import { toLocale } from "@/i18n/routing";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageSquare, Users } from "lucide-react";
import { auth } from "@/auth";
import { getMyThread } from "@/lib/messages";
import { AgentFindPreview } from "@/components/talents/agent-find-preview";
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
 * Messages: the performer's one conversation with the Agental team, under
 * the Agental Find preview. People answer here; nothing in this page talks
 * to a model.
 */
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "talents" });

  const session = await auth();
  if (!session?.user?.id) return null;

  const { threadId, messages } = await getMyThread(session.user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">{t("space.messages.title")}</h1>
        <p className="text-fg-muted">{t("space.messages.subtitle")}</p>
      </div>
      <AgentFindPreview />

      <section
        aria-labelledby="team-conversation"
        className="overflow-hidden rounded-sedan-xl border border-border bg-surface"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Users aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-fg-muted">{t("space.messages.to")}</p>
            <h2 id="team-conversation" className="font-display text-lg font-medium">
              {t("space.team.title")}
            </h2>
          </div>
        </header>

        <div className="space-y-5 p-5">
          {messages.length === 0 ? (
            <div className="rounded-sedan border border-dashed border-border bg-surface-2/40 p-6 text-center">
              <MessageSquare aria-hidden="true" className="mx-auto size-7 text-accent" />
              <p className="mt-3 font-medium">{t("space.messages.empty")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
                {t("space.team.firstMessage")}
              </p>
            </div>
          ) : (
            <MessageList
              messages={messages}
              ownSide="performer"
              teamLabel={t("space.team.title")}
              performerLabel={t("space.messages.you")}
              locale={locale}
            />
          )}

          <MessageComposer
            labels={{
              label: t("space.messages.composerLabel"),
              placeholder: t("space.messages.placeholder"),
              send: t("space.messages.send"),
              sending: t("space.messages.sending"),
              hint: t("space.messages.repliesHere"),
            }}
          />
        </div>
      </section>
      {threadId && <MarkThreadRead />}
    </div>
  );
}
