import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { escapeHtml } from "@/lib/email-templates";
import { emailSenderConfigured, sendEmail } from "@/lib/mailer";

/**
 * Round 9, group 7: replies to the emails sent to contact@agental.co.
 *
 * "Agental Beta V2 - Direct Replies" reads the email, skips spam and
 * automated mail, writes a draft and posts it here (never sends). A staff
 * member opens Admin > Replies to approve, reads the original email and the
 * draft, then: Send, Edit then send, or Discard. Only that click sends, from
 * EMAIL_FROM, to the original sender, in the original thread (Re: subject,
 * In-Reply-To and References), with a hidden copy to the team address so
 * the team's mailbox keeps it. Every decision is audited. The email texts
 * are cleared after 90 days.
 */
const GMAIL_ID = z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/);
const MESSAGE_ID = z.string().trim().max(250).regex(/^<[^<>\s]+@[^<>\s]+>$/);
const EMAIL = z.string().trim().toLowerCase().max(254).email();

export const InboxDraftInput = z.object({
  claimId: z.string().trim().min(1).max(64),
  threadId: GMAIL_ID,
  messageId: GMAIL_ID,
  executionId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).nullish(),
  to: EMAIL,
  replyText: z.string().trim().min(1).max(8000),
  category: z.string().trim().max(60).regex(/^[a-z0-9_ -]*$/i).nullish(),
  original: z.object({
    from: EMAIL,
    subject: z.string().max(900).refine((s) => !/[\r\n\0]/.test(s)),
    text: z.string().max(4000),
    messageIdHeader: MESSAGE_ID,
    references: z.array(MESSAGE_ID).max(10).catch([]),
  }),
});

export const TEXT_RETENTION_DAYS = 90;
export const TEAM_COPY = "contact@agental.co";

/** The workflow's draft, once per claimed email. A retry answers what is stored. */
export async function recordDraft(input: z.infer<typeof InboxDraftInput>, now = new Date()) {
  if (input.to !== input.original.from) return { recorded: false as const, reason: "recipient_mismatch" };
  const row = await prisma.inboxReply.findUnique({ where: { claimId: input.claimId } });
  if (!row || row.gmailThreadId !== input.threadId || row.gmailMessageId !== input.messageId) {
    return { recorded: false as const, reason: "unknown_claim" };
  }
  if (row.status !== "claimed") return { recorded: true as const, status: row.status, duplicate: true };
  // Staff already handled this email (marked reviewed): a late draft never revives it.
  if (row.reviewedAt) return { recorded: false as const, reason: "already_reviewed" };
  const res = await prisma.inboxReply.updateMany({
    where: { id: row.id, status: "claimed", reviewedAt: null },
    data: {
      status: "awaiting_approval",
      fromAddress: input.original.from,
      subject: input.original.subject.slice(0, 900),
      originalText: input.original.text,
      replyText: input.replyText,
      inReplyTo: input.original.messageIdHeader,
      references: JSON.stringify([...new Set([...input.original.references, input.original.messageIdHeader])].slice(-10)),
      category: input.category ?? null,
      draftedAt: now,
    },
  });
  return { recorded: true as const, status: "awaiting_approval" as const, duplicate: res.count === 0 };
}

export function countDraftsToApprove() {
  return prisma.inboxReply.count({ where: { status: "awaiting_approval" } });
}

export function listDraftsToApprove(take = 50) {
  return prisma.inboxReply.findMany({
    where: { status: "awaiting_approval" },
    orderBy: { draftedAt: "asc" },
    take,
    select: { id: true, fromAddress: true, subject: true, originalText: true, replyText: true, category: true, draftedAt: true, gmailThreadId: true },
  });
}

export function listRecentDecisions(take = 20) {
  return prisma.inboxReply.findMany({
    where: { status: { in: ["approved_sent", "discarded"] } },
    orderBy: { decidedAt: "desc" },
    take,
    select: { id: true, fromAddress: true, subject: true, status: true, decision: true, decidedAt: true, decidedById: true },
  });
}

export type DecisionResult = { ok: true } | { ok: false; reason: "not_found" | "already_decided" | "no_sender" | "send_failed" | "empty" };

function replySubject(subject: string | null): string {
  const s = (subject ?? "").trim() || "Your message to Agental";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Send the draft (as written, or as edited by the staff member). The row is
 * claimed first (awaiting_approval -> sending): two staff members, or a
 * double click, send it once. A failed send puts it back.
 */
export async function sendDraft(adminId: string, id: string, editedText?: string | null, now = new Date()): Promise<DecisionResult> {
  if (!emailSenderConfigured()) return { ok: false, reason: "no_sender" };
  const row = await prisma.inboxReply.findUnique({ where: { id } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "awaiting_approval" || !row.fromAddress || !row.replyText) return { ok: false, reason: "already_decided" };
  const text = (editedText ?? row.replyText).replace(/\r\n/g, "\n").trim().slice(0, 8000);
  if (!text) return { ok: false, reason: "empty" };
  const edited = editedText != null && text !== row.replyText.trim();
  const claimed = await prisma.inboxReply.updateMany({ where: { id, status: "awaiting_approval" }, data: { status: "sending", decidedById: adminId } });
  if (claimed.count !== 1) return { ok: false, reason: "already_decided" };
  let references: string[] = [];
  try {
    const parsed = JSON.parse(row.references ?? "[]") as unknown;
    references = Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === "string" && /^<[^<>\s]+@[^<>\s]+>$/.test(r)) : [];
  } catch {
    references = [];
  }
  const res = await sendEmail({
    to: row.fromAddress,
    bcc: TEAM_COPY,
    replyTo: TEAM_COPY,
    // The same reply text for the same email is accepted once by Resend, even after a timeout.
    idempotencyKey: `inbox-reply-${id}-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`,
    kind: "inbox_reply",
    subject: replySubject(row.subject),
    text,
    html: `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0B1220">${text
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("")}</body></html>`,
    headers: {
      ...(row.inReplyTo ? { "In-Reply-To": row.inReplyTo } : {}),
      ...(references.length ? { References: references.join(" ") } : {}),
    },
  });
  if (!res.ok || res.mode !== "resend") {
    await prisma.inboxReply.updateMany({ where: { id, status: "sending" }, data: { status: "awaiting_approval", decidedById: null } });
    await audit({ actorUserId: adminId, action: "admin.reply.send_failed", resourceType: "InboxReply", resourceId: id });
    return { ok: false, reason: "send_failed" };
  }
  await prisma.inboxReply.update({
    where: { id },
    data: { status: "approved_sent", decision: edited ? "edited" : "sent", decidedAt: now, replyText: text },
  });
  await audit({ actorUserId: adminId, action: "admin.reply.send", resourceType: "InboxReply", resourceId: id, after: { edited, thread: row.gmailThreadId } });
  return { ok: true };
}

export async function discardDraft(adminId: string, id: string, now = new Date()): Promise<DecisionResult> {
  const res = await prisma.inboxReply.updateMany({
    where: { id, status: "awaiting_approval" },
    data: { status: "discarded", decision: "discarded", decidedAt: now, decidedById: adminId },
  });
  if (res.count !== 1) return { ok: false, reason: "already_decided" };
  await audit({ actorUserId: adminId, action: "admin.reply.discard", resourceType: "InboxReply", resourceId: id });
  return { ok: true };
}

/** Email texts older than 90 days are cleared (ids, statuses and decisions stay). */
export async function purgeOldReplyTexts(now = new Date()) {
  const cutoff = new Date(now.getTime() - TEXT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // A draft nobody decided on in 90 days is closed, then every text, address and subject is cleared.
  await prisma.inboxReply.updateMany({
    where: { draftedAt: { lt: cutoff }, status: "awaiting_approval" },
    data: { status: "discarded", decision: "expired", decidedAt: now },
  });
  await prisma.inboxReply.updateMany({
    where: { draftedAt: { lt: cutoff }, OR: [{ originalText: { not: null } }, { replyText: { not: null } }, { fromAddress: { not: null } }, { subject: { not: null } }] },
    data: { originalText: null, replyText: null, fromAddress: null, subject: null },
  });
  // A "sending" row left by a crash (the send may or may not have happened) is shown again, marked.
  await prisma.inboxReply.updateMany({
    where: { status: "sending", updatedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
    data: { status: "send_needs_reconciliation" },
  });
}
