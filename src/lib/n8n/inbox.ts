import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Direct email replies (round 7), for the n8n "Beta V2 Direct Replies"
 * workflow. Three calls, all with `Authorization: Bearer <secret>`:
 *
 *   claim     { threadId, messageId, executionId } -> { status, threadId, messageId, claimId? }
 *             claimed: first claim for this Gmail message; existing: already
 *             handled or claimed; busy: never returned by this store (a
 *             unique index decides at once).
 *   complete  the workflow's receipt (sent, send_needs_reconciliation,
 *             needs_human_review, send_skipped), matched by claimId.
 *   review    an inbound message that needs a person without any reply.
 *
 * Only Gmail ids, statuses and short reasons are stored; no email text.
 */

const GMAIL_ID = z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/);
const SHORT = z.string().trim().max(80).regex(/^[A-Za-z0-9_ -]*$/).nullish();

export const InboxClaimInput = z.object({
  threadId: GMAIL_ID,
  messageId: GMAIL_ID,
  executionId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).nullish(),
});

export async function claimInboxReply(input: z.infer<typeof InboxClaimInput>) {
  const base = { threadId: input.threadId, messageId: input.messageId };
  try {
    const row = await prisma.inboxReply.create({
      data: { gmailThreadId: input.threadId, gmailMessageId: input.messageId, executionId: input.executionId ?? null },
      select: { claimId: true },
    });
    return { status: "claimed" as const, ...base, claimId: row.claimId };
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return { status: "existing" as const, ...base };
    throw error;
  }
}

const OUTCOMES = ["sent", "send_needs_reconciliation", "needs_human_review", "send_skipped"] as const;

export const InboxCompleteInput = z.object({
  claimId: z.string().trim().min(1).max(64),
  threadId: GMAIL_ID,
  messageId: GMAIL_ID,
  status: z.enum(OUTCOMES),
  sentMessageId: GMAIL_ID.nullish(),
  reason: SHORT,
  queue: SHORT,
  priority: SHORT,
});

export async function completeInboxReply(input: z.infer<typeof InboxCompleteInput>) {
  const row = await prisma.inboxReply.findUnique({ where: { claimId: input.claimId } });
  if (!row || row.gmailThreadId !== input.threadId || row.gmailMessageId !== input.messageId) {
    return { recorded: false as const, reason: "unknown_claim" };
  }
  // A receipt is written once: a retried call answers with what is stored.
  if (row.status !== "claimed") return { recorded: true as const, status: row.status, duplicate: true };
  const updated = await prisma.inboxReply.updateMany({
    where: { id: row.id, status: "claimed" },
    data: {
      status: input.status,
      sentMessageId: input.sentMessageId ?? null,
      reason: input.reason ?? null,
      queue: input.queue ?? null,
      priority: input.priority ?? null,
    },
  });
  return { recorded: true as const, status: input.status, duplicate: updated.count === 0 };
}

export const InboxReviewInput = z.object({
  threadId: GMAIL_ID,
  messageId: GMAIL_ID,
  reason: SHORT,
  queue: SHORT,
  priority: SHORT,
  executionId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).nullish(),
});

/** A message for a person, with no reply. One row per Gmail message. */
export async function queueInboxReview(input: z.infer<typeof InboxReviewInput>) {
  const data = {
    status: "needs_human_review",
    reason: input.reason ?? null,
    queue: input.queue ?? null,
    priority: input.priority ?? null,
  };
  const row = await prisma.inboxReply.upsert({
    where: { gmailThreadId_gmailMessageId: { gmailThreadId: input.threadId, gmailMessageId: input.messageId } },
    create: { gmailThreadId: input.threadId, gmailMessageId: input.messageId, executionId: input.executionId ?? null, ...data },
    // Never overwrite a reply that was sent.
    update: {},
    select: { status: true },
  });
  return { queued: row.status === "needs_human_review", status: row.status };
}

/** A claim this old never got its receipt: the email may be unanswered. */
export const INBOX_CLAIM_TTL_MS = 30 * 60 * 1000;

/**
 * For the admin: what waits for a person, oldest first, including claims
 * that never got a receipt (a crashed run), so no email is lost silently.
 * Caller checks admin.
 */
export function listInboxForReview(take = 100, now = new Date()) {
  return prisma.inboxReply.findMany({
    where: {
      reviewedAt: null,
      OR: [
        { status: { in: ["needs_human_review", "send_needs_reconciliation"] } },
        { status: "claimed", createdAt: { lt: new Date(now.getTime() - INBOX_CLAIM_TTL_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, gmailThreadId: true, status: true, reason: true, queue: true, priority: true, createdAt: true },
  });
}

/** Staff handled it in Gmail. Caller checks admin and writes the audit entry. */
export async function markInboxReviewed(id: string, now = new Date()) {
  const r = await prisma.inboxReply.updateMany({ where: { id, reviewedAt: null }, data: { reviewedAt: now } });
  return r.count === 1;
}
