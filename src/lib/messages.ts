import { isAdminAccount } from "@/domain/admin";
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
 * A performer has one thread per conversation (Thread.kind TEAM,
 * Thread.userId; several since round 8d). An id the browser sends is only
 * ever looked up together with the session's user id and "not deleted", so a
 * performer cannot name someone else's thread, nor one they deleted.
 *
 * The team side takes the viewer's user id and checks, here, that the viewer
 * is an admin. A page that forgets its own check still gets nothing.
 */

export const TEAM_THREAD = "TEAM";

type Db = Pick<PrismaClient, "thread" | "message" | "user">;

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
  /** Null for a new conversation (nothing sent yet). */
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

/** The performer's own conversations, still visible to them (round 8d). */
const myThreads = (userId: string) => ({ userId, kind: TEAM_THREAD, hiddenForUserAt: null });

export const CONVERSATION_TITLE_MAX = 60;

export interface MyConversation {
  threadId: string;
  /** From the first message; null when it has none yet. */
  title: string | null;
  /** The latest message, or when it was opened. */
  at: Date;
}

/** The performer's conversations, the most recent first. Deleted ones are left out. */
export async function listMyConversations(userId: string, db: Db = prisma): Promise<MyConversation[]> {
  const threads = await db.thread.findMany({
    where: myThreads(userId),
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      subject: true,
      createdAt: true,
      lastMessageAt: true,
      messages: {
        where: { fromTeam: false, fromAgent: false },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { body: true },
      },
    },
  });
  return threads.map((t) => ({
    threadId: t.id,
    title: t.subject ?? (t.messages[0] ? messagePreview(t.messages[0].body, CONVERSATION_TITLE_MAX) : null),
    at: t.lastMessageAt ?? t.createdAt,
  }));
}

/**
 * One of the signed-in performer's conversations: the one asked for when it
 * is theirs and not deleted, otherwise the most recent. `"new"` asks for an
 * empty conversation (the first message creates it).
 */
export async function getMyThread(
  userId: string,
  db: Db = prisma,
  wanted?: string | null
): Promise<MyThread> {
  const empty: MyThread = { threadId: null, waitingForTeam: false, messages: [] };
  if (wanted === "new") return empty;
  const select = { id: true, waitingForTeamSince: true } as const;
  const thread =
    (wanted ? await db.thread.findFirst({ where: { ...myThreads(userId), id: wanted }, select }) : null) ??
    (await db.thread.findFirst({
      where: myThreads(userId),
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select,
    }));
  if (!thread) return empty;
  return {
    threadId: thread.id,
    waitingForTeam: thread.waitingForTeamSince !== null,
    messages: await recentMessages(db, thread.id),
  };
}

/** The thread id when it is the performer's own, visible conversation, otherwise null. */
export async function ownVisibleThread(
  db: Pick<Db, "thread">,
  userId: string,
  threadId: string
): Promise<string | null> {
  const row = await db.thread.findFirst({ where: { ...myThreads(userId), id: threadId }, select: { id: true } });
  return row?.id ?? null;
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

/**
 * A new conversation for the performer's first message in it, titled from
 * that message. A retry of the same draft (same clientKey) finds the thread
 * the first try created instead of opening a second one.
 */
export async function startTeamThread(
  db: Pick<Db, "thread" | "message">,
  userId: string,
  firstMessage: { body: string; clientKey: string }
): Promise<string> {
  const retried = await db.message.findFirst({
    where: { clientKey: firstMessage.clientKey, senderId: userId, thread: { userId, kind: TEAM_THREAD } },
    select: { threadId: true },
  });
  if (retried) return retried.threadId;
  const created = await db.thread.create({
    data: {
      userId,
      kind: TEAM_THREAD,
      subject: messagePreview(firstMessage.body, CONVERSATION_TITLE_MAX),
    },
    select: { id: true },
  });
  return created.id;
}

/* ── Team side ───────────────────────────────────────────────────────────── */

export async function isTeamMember(userId: string, db: Pick<Db, "user"> = prisma): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true, email: true } });
  return isAdminAccount(user);
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
  /** When the handoff was recorded, or null. */
  waitingSince: Date | null;
  /** Messages from the performer the team has not opened. */
  unread: number;
  /** Round 8d: the performer deleted it from their Messages (kept for the team). */
  hiddenForUser: boolean;
}

/**
 * The team inbox, most recent conversation first. With `waiting`, only the
 * threads handed to a person ("Waiting for the Agental team"), the oldest
 * handoff first. Empty for a non-admin.
 */
export async function listTeamThreads(
  viewerUserId: string,
  opts: { limit?: number; waiting?: boolean } = {},
  db: Db = prisma
): Promise<TeamThreadRow[]> {
  if (!(await isTeamMember(viewerUserId, db))) return [];
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const threads = await db.thread.findMany({
    where: { kind: TEAM_THREAD, userId: { not: null }, ...(opts.waiting ? { waitingForTeamSince: { not: null } } : {}) },
    orderBy: opts.waiting
      ? [{ waitingForTeamSince: "asc" }, { id: "asc" }]
      : [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      lastMessageAt: true,
      waitingForTeamSince: true,
      hiddenForUserAt: true,
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
      waitingSince: thread.waitingForTeamSince,
      unread: thread._count.messages,
      hiddenForUser: thread.hiddenForUserAt !== null,
    });
  }
  return rows;
}

export interface TeamThread {
  threadId: string;
  waitingForTeam: boolean;
  /** Round 8d: the performer deleted it; they no longer see it. */
  hiddenForUser: boolean;
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
      hiddenForUserAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!thread?.user) return null;
  return {
    threadId: thread.id,
    waitingForTeam: thread.waitingForTeamSince !== null,
    hiddenForUser: thread.hiddenForUserAt !== null,
    user: thread.user,
    messages: await recentMessages(db, thread.id),
  };
}

/** How many conversations wait for a person. Zero for a non-admin. */
export async function countWaitingThreads(viewerUserId: string, db: Db = prisma): Promise<number> {
  if (!(await isTeamMember(viewerUserId, db))) return 0;
  return db.thread.count({ where: { kind: TEAM_THREAD, userId: { not: null }, waitingForTeamSince: { not: null } } });
}
