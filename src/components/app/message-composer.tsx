"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
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
}

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
  const id = useId();
  const [body, setBody] = useState("");
  const [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<ActionError | undefined>();
  const [pending, start] = useTransition();
  const empty = body.trim().length === 0;

  function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (empty || pending) return;
    setError(undefined);
    start(async () => {
      try {
        const input = { body, clientKey };
        const res = threadId ? await replyAsTeam(threadId, input) : await sendMessage(input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setBody("");
        setClientKey(crypto.randomUUID());
        router.refresh();
      } catch {
        // A network failure: the draft and its key stay for the retry.
        setError(err("errors.generic"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
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
        <Button type="submit" disabled={empty || pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send />}
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
