import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/format";
import type { ThreadMessage } from "@/domain/messages";

/**
 * One conversation between a performer and the Agental team, oldest first.
 * Shared by the performer's Messages page and the admin inbox: `ownSide`
 * says which side is the reader, whose messages sit on the right.
 *
 * Bodies are rendered as text, line breaks kept. Who on the team wrote a
 * message is never part of ThreadMessage, so it cannot be shown.
 */
export function MessageList({
  messages,
  ownSide,
  teamLabel,
  performerLabel,
  assistantLabel,
  topicLabels,
  locale,
}: {
  messages: ThreadMessage[];
  ownSide: "team" | "performer";
  teamLabel: string;
  performerLabel: string;
  /** The Agental assistant's messages sit on the team's side. */
  assistantLabel: string;
  /** Shown next to a performer message that has a topic. */
  topicLabels?: Record<string, string>;
  locale: string;
}) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const teamSide = m.fromTeam || m.fromAgent;
        const own = (ownSide === "team") === teamSide;
        return (
          <li key={m.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-sedan px-4 py-3 text-sm sm:max-w-[75%]",
                m.fromTeam
                  ? "border border-accent/40 bg-accent-soft/60"
                  : m.fromAgent
                    ? "border border-dashed border-accent/40 bg-surface"
                    : "border border-border bg-surface-2"
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className={cn("font-bold", teamSide ? "text-accent" : "text-fg")}>
                  {m.fromTeam ? teamLabel : m.fromAgent ? assistantLabel : performerLabel}
                </span>
                {m.topic && topicLabels?.[m.topic] && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted">
                    {topicLabels[m.topic]}
                  </span>
                )}
                <time dateTime={m.createdAt.toISOString()} className="text-fg-subtle">
                  {dateTime(m.createdAt, locale)}
                </time>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-fg">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
