import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 9, group 7: replies to the emails we receive, against the local
 * database with the mailer faked. The workflow's draft is stored once and
 * sends nothing; only a staff click sends, once, to the original sender in
 * the original thread, with a copy to the team; Edit and Discard are recorded.
 */
const sent: { to: string; bcc?: string; subject: string; text: string; headers?: Record<string, string>; kind?: string }[] = [];
let outcome: { ok: true; mode: "resend" } | { ok: false } = { ok: true, mode: "resend" };
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => true,
  sendEmail: async (m: (typeof sent)[number]) => (sent.push(m), outcome),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const SECRET = "test-n8n-secret-with-enough-length-r9-g7";
const { recordDraft, sendDraft, discardDraft, countDraftsToApprove } = await import("@/lib/reply-drafts");
const { claimInboxReply } = await import("@/lib/n8n/inbox");
const draftRoute = await import("@/app/api/n8n/inbox/draft/route");
const P = "r9g7";
let adminId = "";

const draft = (claimId: string, n: number, over: Record<string, unknown> = {}) => ({
  claimId,
  threadId: `${P}thread${n}`,
  messageId: `${P}msg${n}`,
  executionId: "exec1",
  to: "fan@example.test",
  replyText: "Hello,\n\nThanks for writing to Agental. Here is how it works.\n\nThe Agental team",
  category: "general",
  original: { from: "fan@example.test", subject: "Question about plans", text: "Hi, how do plans work?", messageIdHeader: `<orig${n}@mail.example.test>`, references: [`<older${n}@mail.example.test>`] },
  ...over,
});

describe.skipIf(!local)("replies to approve", () => {
  beforeAll(async () => {
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    adminId = (await prisma.user.create({ data: { email: "r9g7-admin@test.local", isAdmin: true, accountStatus: "STAFF" } })).id;
  });
  beforeEach(() => {
    sent.length = 0;
    outcome = { ok: true, mode: "resend" };
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.inboxReply.deleteMany({ where: { gmailThreadId: { startsWith: P } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  });

  it("stores the workflow's draft once, through the signed route, and sends nothing", async () => {
    const c = await claimInboxReply({ threadId: `${P}thread1`, messageId: `${P}msg1`, executionId: "exec1" });
    const call = (body: unknown, auth = `Bearer ${SECRET}`) =>
      draftRoute.POST(new Request("https://app.test/api/n8n/inbox/draft", { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body: JSON.stringify(body) }));
    expect((await call(draft(c.claimId!, 1), "Bearer wrong")).status).toBe(401);
    const res = await call(draft(c.claimId!, 1));
    expect(await res.json()).toMatchObject({ recorded: true, status: "awaiting_approval" });
    expect(await (await call(draft(c.claimId!, 1))).json()).toMatchObject({ duplicate: true });
    expect(sent).toHaveLength(0);
    expect(await countDraftsToApprove()).toBeGreaterThanOrEqual(1);
  });

  it("refuses a draft addressed to someone other than the sender", async () => {
    const c = await claimInboxReply({ threadId: `${P}thread2`, messageId: `${P}msg2`, executionId: "exec1" });
    expect(await recordDraft(draft(c.claimId!, 2, { to: "someone-else@example.test" }))).toMatchObject({ recorded: false, reason: "recipient_mismatch" });
  });

  it("sends on a staff click, in the original thread with a team copy, and only once", async () => {
    const row = await prisma.inboxReply.findFirstOrThrow({ where: { gmailThreadId: `${P}thread1` } });
    expect(await sendDraft(adminId, row.id)).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "fan@example.test", bcc: "contact@agental.co", subject: "Re: Question about plans", kind: "inbox_reply" });
    expect(sent[0].headers).toEqual({ "In-Reply-To": "<orig1@mail.example.test>", References: "<older1@mail.example.test> <orig1@mail.example.test>" });
    expect(await sendDraft(adminId, row.id)).toEqual({ ok: false, reason: "already_decided" });
    expect(sent).toHaveLength(1);
    expect(await prisma.inboxReply.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "approved_sent", decision: "sent", decidedById: adminId });
  });

  it("edit then send records the edit; a failed send keeps the draft; discard sends nothing", async () => {
    const c3 = await claimInboxReply({ threadId: `${P}thread3`, messageId: `${P}msg3`, executionId: "exec1" });
    await recordDraft(draft(c3.claimId!, 3));
    const r3 = await prisma.inboxReply.findFirstOrThrow({ where: { gmailThreadId: `${P}thread3` } });
    outcome = { ok: false };
    expect(await sendDraft(adminId, r3.id, "A shorter answer.")).toEqual({ ok: false, reason: "send_failed" });
    expect((await prisma.inboxReply.findUniqueOrThrow({ where: { id: r3.id } })).status).toBe("awaiting_approval");
    outcome = { ok: true, mode: "resend" };
    expect(await sendDraft(adminId, r3.id, "A shorter answer.")).toEqual({ ok: true });
    expect(await prisma.inboxReply.findUniqueOrThrow({ where: { id: r3.id } })).toMatchObject({ decision: "edited", replyText: "A shorter answer." });

    const c4 = await claimInboxReply({ threadId: `${P}thread4`, messageId: `${P}msg4`, executionId: "exec1" });
    await recordDraft(draft(c4.claimId!, 4));
    const r4 = await prisma.inboxReply.findFirstOrThrow({ where: { gmailThreadId: `${P}thread4` } });
    sent.length = 0;
    expect(await discardDraft(adminId, r4.id)).toEqual({ ok: true });
    expect(await sendDraft(adminId, r4.id)).toEqual({ ok: false, reason: "already_decided" });
    expect(sent).toHaveLength(0);
  });
});
