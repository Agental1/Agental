import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  THREAD_PAGE_SIZE,
  messagePreview,
  type ThreadMessage,
} from "@/domain/messages";

/**
 * Reading and writing the conversation between a performer and the Agental
 * team. Server-only.
 *
 * A performer has exactly one such thread (Thread.kind TEAM, Thread.userId),
 * found from the session and never from an id the browser sends. That is the
 * whole isolation rule on the performer's side: there is no way to name
 * someone else's thread.
 *
 * The team side takes the viewer's user id and checks, here, that the viewer
 * is an admin. A page that forgets its own check still gets nothing.
 */

export const TEAM_THREAD = "TEAM";

type Db = Pick<PrismaClient, "thread" | "message" | "user">;
type Tx = Pick<Prisma.TransactionClient, "thread" | "message">;

const MESSAGE_FIELDS = {
  id: true,
  body: true,
  fromTeam: true,
  fromAgent: true,
  topic: true,
  createdAt: true,
  readAt: true,
} as const;

export interface MyThread {
  /** Null until the performer sends a first message. */
  threadId: string | null;
  /** The assistant handed over and the team has not answered yet. */
  waitingForTeam: boolean;
  /** Oldest first, the most recent THREAD_PAGE_SIZE at most. */
  messages: ThreadMessage[];
}

async function recentMessages(db: Pick<Db, "message">, threadId: string) {
  const rows = await db.message.findMany({
    where: { threadId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: THREAD_PAGE_SIZE,
    select: MESSAGE_FIELDS,
  });
  return rows.reverse();
}

/** The signed-in performer's conversation with the team. */
export async function getMyThread(userId: string, db: Db = prisma): Promise<MyThread> {
  const thread = await db.thread.findUnique({
    where: { userId_kind: { userId, kind: TEAM_THREAD } },
    select: { id: true, waitingForTeamSince: true },
  });
  if (!thread) return { threadId: null, waitingForTeam: false, messages: [] };
  return {
    threadId: thread.id,
    waitingForTeam: thread.waitingForTeamSince !== null,
    messages: await recentMessages(db, thread.id),
  };
}

export interface PostedMessage {
  threadId: string;
  messageId: string;
  createdAt: Date;
  /** false when this clientKey had already been stored: nothing new was written. */
  created: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Store one message in a thread, once per clientKey.
 *
 * The unique index on (threadId, clientKey) is what makes a retry safe: the
 * second insert fails and the first message is returned instead. A key that
 * already belongs to the other side of the conversation is refused (null), so
 * one side cannot be answered with the other side's message.
 */
export async function postMessage(
  db: Pick<PrismaClient, "thread" | "message">,
  input: {
    threadId: string;
    senderId: string | null;
    fromTeam: boolean;
    body: string;
    clientKey: string;
    /** The Agental assistant wrote it (fromTeam stays false). */
    fromAgent?: boolean;
    topic?: string | null;
    now?: Date;
  }
): Promise<PostedMessage | null> {
  const now = input.now ?? new Date();
  try {
    const message = await db.message.create({
      data: {
        threadId: input.threadId,
        senderId: input.senderId,
        fromTeam: input.fromTeam,
        fromAgent: input.fromAgent ?? false,
        topic: input.topic ?? null,
        body: input.body,
        clientKey: input.clientKey,
        createdAt: now,
      },
      select: { id: true, createdAt: true },
    });
    await db.thread.update({
      where: { id: input.threadId },
      data: { lastMessageAt: now },
    });
    return {
      threadId: input.threadId,
      messageId: message.id,
      createdAt: message.createdAt,
      created: true,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const first = await db.message.findUnique({
      where: {
        threadId_clientKey: { threadId: input.threadId, clientKey: input.clientKey },
      },
      select: { id: true, createdAt: true, fromTeam: true, senderId: true },
    });
    if (!first || first.fromTeam !== input.fromTeam) return null;
    return {
      threadId: input.threadId,
      messageId: first.id,
      createdAt: first.createdAt,
      created: false,
    };
  }
}

/** Find the performer's team thread, creating it on the first message. */
export async function ensureTeamThread(db: Tx, userId: string): Promise<string> {
  const where = { userId_kind: { userId, kind: TEAM_THREAD } };
  const existing = await db.thread.findUnique({ where, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await db.thread.create({
      data: { userId, kind: TEAM_THREAD },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    // Two first messages sent together: the other request created the thread.
    if (!isUniqueViolation(error)) throw error;
    const winner = await db.thread.findUnique({ where, select: { id: true } });
    if (!winner) throw error;
    return winner.id;
  }
}

/* ── Team side ───────────────────────────────────────────────────────────── */

export async function isTeamMember(userId: string, db: Pick<Db, "user"> = prisma): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return user?.isAdmin === true;
}

export interface TeamThreadRow {
  threadId: string;
  user: { id: string; name: string | null; email: string };
  lastMessageAt: Date | null;
  /** One line from the latest message. */
  preview: string;
  /** The latest message is the performer's: the team has not answered it. */
  awaitingReply: boolean;
  /** The assistant handed the conversation over: "Waiting for the Agental team". */
  waitingForTeam: boolean;
  /** Messages from the performer the team has not opened. */
  unread: number;
}

/** The team inbox, most recent conversation first. Empty for a non-admin. */
export async function listTeamThreads(
  viewerUserId: string,
  opts: { limit?: number } = {},
  db: Db = prisma
): Promise<TeamThreadRow[]> {
  if (!(await isTeamMember(viewerUserId, db))) return [];
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const threads = await db.thread.findMany({
    where: { kind: TEAM_THREAD, userId: { not: null } },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      lastMessageAt: true,
      waitingForTeamSince: true,
      user: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { body: true, fromTeam: true, fromAgent: true },
      },
      _count: { select: { messages: { where: { fromTeam: false, fromAgent: false, readAt: null } } } },
    },
  });
  const rows: TeamThreadRow[] = [];
  for (const thread of threads) {
    if (!thread.user) continue;
    const last = thread.messages[0];
    rows.push({
      threadId: thread.id,
      user: thread.user,
      lastMessageAt: thread.lastMessageAt,
      preview: last ? messagePreview(last.body) : "",
      awaitingReply:
        thread.waitingForTeamSince !== null || (last ? !last.fromTeam && !last.fromAgent : false),
      waitingForTeam: thread.waitingForTeamSince !== null,
      unread: thread._count.messages,
    });
  }
  return rows;
}

export interface TeamThread {
  threadId: string;
  waitingForTeam: boolean;
  user: { id: string; name: string | null; email: string };
  messages: ThreadMessage[];
}

/** One conversation, for the team. Null for a non-admin or an unknown thread. */
export async function getTeamThread(
  viewerUserId: string,
  threadId: string,
  db: Db = prisma
): Promise<TeamThread | null> {
  if (!(await isTeamMember(viewerUserId, db))) return null;
  const thread = await db.thread.findFirst({
    where: { id: threadId, kind: TEAM_THREAD },
    select: {
      id: true,
      waitingForTeamSince: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!thread?.user) return null;
  return {
    threadId: thread.id,
    waitingForTeam: thread.waitingForTeamSince !== null,
    user: thread.user,
    messages: await recentMessages(db, thread.id),
  };
}
