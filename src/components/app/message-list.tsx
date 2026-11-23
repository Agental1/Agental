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
  aiTag,
  topicLabels,
  locale,
  avatars = false,
}: {
  messages: ThreadMessage[];
  ownSide: "team" | "performer";
  teamLabel: string;
  performerLabel: string;
  /** The Agental assistant's messages sit on the team's side. */
  assistantLabel: string;
  /** Round 9: the tag next to the agent's name ("AI agent"), so nobody takes it for a person. */
  aiTag?: string;
  /** Shown next to a performer message that has a topic. */
  topicLabels?: Record<string, string>;
  locale: string;
  /** Round 8d: an initial next to the other side's messages ("S" for Sam). */
  avatars?: boolean;
}) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const teamSide = m.fromTeam || m.fromAgent;
        const own = (ownSide === "team") === teamSide;
        const author = m.fromTeam ? teamLabel : m.fromAgent ? assistantLabel : performerLabel;
        return (
          <li key={m.id} className={cn("flex items-end gap-2", own ? "justify-end" : "justify-start")}>
            {avatars && !own && (
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent"
              >
                {Array.from(author.trim())[0]?.toLocaleUpperCase() ?? "?"}
              </span>
            )}
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
                  {author}
                </span>
                {m.fromAgent && aiTag && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">{aiTag}</span>
                )}
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
