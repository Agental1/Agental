"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/mailer";
import { err, type ActionError, type ErrorKey } from "@/domain/action-result";
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_RATE,
  SendMessageInput,
  TEAM_ALERT_RATE,
} from "@/domain/messages";
import {
  TEAM_THREAD,
  ensureTeamThread,
  isTeamMember,
  postMessage,
} from "@/lib/messages";

/**
 * Human Messages. A performer writes to the Agental team; the team answers
 * from the admin inbox. Replies are read in the app, on the Messages page: no
 * email is sent to the performer.
 *
 * Nothing here talks to a model, a workflow or a webhook. This is a plain
 * conversation between people, stored in Thread and Message.
 */

export type SendMessageResult =
  | { ok: true; threadId: string; messageId: string; createdAt: Date }
  | { ok: false; error: ActionError };

export type MessageActionResult = { ok: true } | { ok: false; error: ActionError };

const KNOWN_INPUT_ERRORS: ReadonlySet<string> = new Set([
  "errors.messageEmpty",
  "errors.messageTooLong",
]);

function inputError(issueMessage: string | undefined): ActionError {
  if (issueMessage === "errors.messageTooLong") {
    return err("errors.messageTooLong", { limit: MESSAGE_MAX_LENGTH });
  }
  return err(
    issueMessage && KNOWN_INPUT_ERRORS.has(issueMessage)
      ? (issueMessage as ErrorKey)
      : "errors.invalidInput"
  );
}

function revalidateMessages() {
  revalidatePath("/[locale]/talents/(space)", "layout");
  revalidatePath("/[locale]/admin", "layout");
}

/**
 * Tell the team inbox that a performer wrote, at most once per thread every
 * ten minutes. The mail names the thread by id and carries no name, no email
 * address and no message text. Best effort: the message is already stored and
 * shows in the admin inbox whether or not this mail goes out.
 */
async function alertTeam(threadId: string): Promise<void> {
  const to = process.env.TEAM_INBOX_EMAIL?.trim();
  if (!to) return;
  try {
    const gate = await hitRateLimit(prisma, `msg-alert:${threadId}`, TEAM_ALERT_RATE);
    if (!gate.allowed) return;
    const text =
      `A performer sent a message to the Agental team.\n\n` +
      `Thread: ${threadId}\n` +
      `Read and answer it in the admin inbox (Admin > Messages).`;
    await sendEmail({
      to,
      subject: "New message for the Agental team",
      text,
      html: `<p>A performer sent a message to the Agental team.</p><p>Thread: ${threadId}</p><p>Read and answer it in the admin inbox (Admin &gt; Messages).</p>`,
    });
  } catch (error) {
    console.error("[messages] team alert failed", {
      threadId,
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * Send a message to the Agental team.
 *
 * The thread is the caller's own, found from the session: no thread id is
 * accepted. `clientKey` is a random id made once per draft; sending the same
 * draft again (a retry after a timeout, a double click) returns the message
 * stored the first time and writes nothing.
 */
export async function sendMessage(input: unknown): Promise<SendMessageResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user.kind !== "TALENT") {
    return { ok: false, error: err("errors.unauthorized") };
  }
  const parsed = SendMessageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: inputError(parsed.error.issues[0]?.message) };
  }

  const gate = await hitRateLimit(prisma, `msg:${userId}`, MESSAGE_RATE);
  if (!gate.allowed) return { ok: false, error: err("errors.tooManyAttempts") };

  const threadId = await ensureTeamThread(prisma, userId);
  const posted = await postMessage(prisma, {
    threadId,
    senderId: userId,
    fromTeam: false,
    body: parsed.data.body,
    clientKey: parsed.data.clientKey,
  });
  if (!posted) return { ok: false, error: err("errors.invalidInput") };

  if (posted.created) {
    await alertTeam(threadId);
    revalidateMessages();
  }
  return {
    ok: true,
    threadId: posted.threadId,
    messageId: posted.messageId,
    createdAt: posted.createdAt,
  };
}

/** The performer opened Messages: the team's messages count as read. */
export async function markMyThreadRead(): Promise<MessageActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: err("errors.unauthorized") };
  await prisma.message.updateMany({
    where: {
      thread: { userId, kind: TEAM_THREAD },
      fromTeam: true,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

/* ── Team side (admins) ──────────────────────────────────────────────────── */

async function requireTeam(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return (await isTeamMember(userId)) ? userId : null;
}

/**
 * Answer a performer, as the Agental team. Admins only. The performer sees
 * "Agental team" and never which person wrote; that stays in the audit log.
 * Opening a thread to answer it also marks the performer's messages as read.
 */
export async function replyAsTeam(
  threadId: string,
  input: unknown
): Promise<SendMessageResult> {
  const adminId = await requireTeam();
  if (!adminId) return { ok: false, error: err("errors.unauthorized") };
  const parsed = SendMessageInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: inputError(parsed.error.issues[0]?.message) };
  }
  if (typeof threadId !== "string" || threadId.length === 0 || threadId.length > 100) {
    return { ok: false, error: err("errors.notFound") };
  }
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, kind: TEAM_THREAD, userId: { not: null } },
    select: { id: true },
  });
  if (!thread) return { ok: false, error: err("errors.notFound") };

  const posted = await postMessage(prisma, {
    threadId: thread.id,
    senderId: adminId,
    fromTeam: true,
    body: parsed.data.body,
    clientKey: parsed.data.clientKey,
  });
  if (!posted) return { ok: false, error: err("errors.invalidInput") };

  if (posted.created) {
    await prisma.message.updateMany({
      where: { threadId: thread.id, fromTeam: false, readAt: null },
      data: { readAt: posted.createdAt },
    });
    await audit({
      actorUserId: adminId,
      action: "message.team.reply",
      resourceType: "Thread",
      resourceId: thread.id,
      // Ids only. The text of a conversation stays out of the audit log.
      after: { messageId: posted.messageId },
    });
    revalidateMessages();
  }
  return {
    ok: true,
    threadId: posted.threadId,
    messageId: posted.messageId,
    createdAt: posted.createdAt,
  };
}

/** The team opened a thread: the performer's messages count as read. */
export async function markThreadRead(threadId: string): Promise<MessageActionResult> {
  const adminId = await requireTeam();
  if (!adminId) return { ok: false, error: err("errors.unauthorized") };
  if (typeof threadId !== "string" || threadId.length === 0 || threadId.length > 100) {
    return { ok: false, error: err("errors.notFound") };
  }
  await prisma.message.updateMany({
    where: {
      thread: { id: threadId, kind: TEAM_THREAD },
      fromTeam: false,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  revalidateMessages();
  return { ok: true };
}
