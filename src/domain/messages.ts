import { z } from "zod";

/**
 * Human Messages: conversations between a performer and the Agental team.
 * Rules shared by the action, the tests and the composer.
 */

export const MESSAGE_MAX_LENGTH = 4000;

/** How many messages one account may send in a window. */
export const MESSAGE_RATE = { limit: 20, windowMs: 10 * 60 * 1000 };

/** At most one alert email to the team per thread in this window. */
export const TEAM_ALERT_RATE = { limit: 1, windowMs: 10 * 60 * 1000 };

/** Messages returned when a thread is read: the most recent ones. */
export const THREAD_PAGE_SIZE = 200;

/**
 * Keep line breaks and tabs, drop the other control characters (a pasted NUL
 * makes Postgres refuse the whole row), and trim the ends.
 */
export function cleanMessageBody(raw: string): string {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

/**
 * `clientKey` is a random id the composer makes once per draft
 * (crypto.randomUUID()). Sending the same draft twice stores one message.
 */
export const SendMessageInput = z.object({
  body: z
    .string({ error: "errors.messageEmpty" })
    .transform(cleanMessageBody)
    .pipe(
      z
        .string()
        .min(1, "errors.messageEmpty")
        .max(MESSAGE_MAX_LENGTH, "errors.messageTooLong")
    ),
  clientKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "errors.invalidInput"),
  /** Performer messages only: what it is about (see src/domain/assistant.ts). */
  topic: z.enum(["profile", "application", "other"], { error: "errors.messageTopicRequired" }).optional(),
  /** The page's language, for the assistant's answer. */
  locale: z.string().max(5).optional(),
  /**
   * Performer side (round 8d): which of their conversations, or "new" to start
   * one. Left out: the most recent one. Always checked against the session.
   */
  conversationId: z.union([z.literal("new"), z.string().regex(/^[a-z0-9]{8,40}$/)]).optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

/** One message as either side reads it. Who on the team wrote it is never included. */
export interface ThreadMessage {
  id: string;
  body: string;
  /** true: written by the Agental team. false: written by the performer. */
  fromTeam: boolean;
  /** Written by the Agental assistant (fromTeam is false). */
  fromAgent: boolean;
  /** Performer messages: profile | application | other, when given. */
  topic: string | null;
  createdAt: Date;
  /** When the other side opened it, or null. */
  readAt: Date | null;
}

/** A short single-line excerpt for an inbox row. */
export function messagePreview(body: string, max = 140): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}
