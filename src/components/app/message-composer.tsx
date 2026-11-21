"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { ActionErrorMessage } from "@/components/app/action-error";
import { err, type ActionError } from "@/domain/action-result";
import { MESSAGE_MAX_LENGTH } from "@/domain/messages";
import {
  markMyThreadRead,
  markThreadRead,
  replyAsTeam,
  sendMessage,
} from "@/app/actions/messages";

export interface ComposerLabels {
  label: string;
  placeholder: string;
  send: string;
  sending: string;
  /** One line under the field, e.g. where the answer will arrive. */
  hint?: string;
  /** Performer side: "What is it about?" and the three choices. */
  topicLegend?: string;
  topics?: { profile: string; application: string; other: string };
}

type Topic = "profile" | "application" | "other";
const TOPICS: Topic[] = ["profile", "application", "other"];

/**
 * Writes one message in a performer's conversation with the Agental team.
 * Without `threadId` it is the performer writing (sendMessage, their own
 * thread from the session); with one it is the team answering (replyAsTeam).
 *
 * A draft carries one clientKey from its first send to its success, so a
 * retry after a failure or a timeout stores the message once. The text stays
 * in the field when sending fails, and is cleared only once it is stored.
 */
export function MessageComposer({
  threadId,
  labels,
}: {
  threadId?: string;
  labels: ComposerLabels;
}) {
  const router = useRouter();
  const tt = useTranslations("common.app.toast");
  const id = useId();
  const [body, setBody] = useState("");
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const locale = useLocale();
  const needsTopic = !threadId && !!labels.topics;
  const [topic, setTopic] = useState<Topic | null>(null);
  const empty = body.trim().length === 0;

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (empty || pending) return;
    if (needsTopic && !topic) {
      setError(err("errors.messageTopicRequired"));
      return;
    }
    setError(undefined);
    start(async () => {
      try {
        const input = needsTopic ? { body, clientKey, topic, locale } : { body, clientKey };
        const res = threadId ? await replyAsTeam(threadId, input) : await sendMessage(input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBody("");
        setClientKey(crypto.randomUUID());
        toast.success(tt("sent"));
        router.refresh();
      } catch {
        // A network failure: the draft and its key stay for the retry.
        setError(err("errors.generic"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
      {needsTopic && labels.topics && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{labels.topicLegend}</legend>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-topic`}
                  value={value}
                  checked={topic === value}
                  onChange={() => {
                    setTopic(value);
                    setError(undefined);
                  }}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-sm hover:border-accent peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:font-bold peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  {labels.topics![value]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label htmlFor={id} className="text-sm font-medium">
        {labels.label}
      </label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl + Enter sends; Enter alone starts a new line.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        rows={4}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={labels.placeholder}
        readOnly={pending}
        className="block w-full resize-y rounded-sedan border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <ActionErrorMessage error={error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {labels.hint ? <p className="text-xs text-fg-muted">{labels.hint}</p> : <span />}
        <Button type="submit" disabled={empty} loading={pending}>
          {!pending && <Send />}
          {pending ? labels.sending : labels.send}
        </Button>
      </div>
    </form>
  );
}

/**
 * Marks the other side's messages as read once the conversation is open.
 * Renders nothing. With `threadId`, the team opened a performer's thread.
 */
export function MarkThreadRead({ threadId }: { threadId?: string }) {
  useEffect(() => {
    void (threadId ? markThreadRead(threadId) : markMyThreadRead()).catch(() => {
      // Best effort: the next visit marks them again.
    });
  }, [threadId]);
  return null;
}
