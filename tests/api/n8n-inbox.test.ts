import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/** Direct email replies: one claim per Gmail message, one receipt, review items kept apart. */
const SECRET = "test-n8n-secret-with-enough-length-0123";
const T = `t${Date.now().toString(36)}`;
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const routes = {
  claim: await import("@/app/api/n8n/inbox/claim/route"),
  complete: await import("@/app/api/n8n/inbox/complete/route"),
  review: await import("@/app/api/n8n/inbox/review/route"),
};
const { listInboxForReview, markInboxReviewed } = await import("@/lib/n8n/inbox");
const post = (k: keyof typeof routes, body: unknown, auth = `Bearer ${SECRET}`) =>
  routes[k]
    .POST(new Request("https://app.test/x", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }))
    .then(async (r) => ({ status: r.status, body: r.status === 404 ? null : await r.json() }));

describe.skipIf(!local)("n8n inbox endpoints", () => {
  beforeAll(() => {
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.inboxReply.deleteMany({ where: { gmailThreadId: { startsWith: T } } });
  });

  it("needs the secret", async () => {
    expect((await post("claim", { threadId: `${T}a`, messageId: "m1" }, "Bearer wrong")).status).toBe(401);
  });

  it("claims a Gmail message once", async () => {
    const first = await post("claim", { threadId: `${T}a`, messageId: "m1", executionId: "e1" });
    expect(first.body).toMatchObject({ status: "claimed", threadId: `${T}a`, messageId: "m1" });
    expect(first.body.claimId).toBeTruthy();
    const again = await post("claim", { threadId: `${T}a`, messageId: "m1", executionId: "e2" });
    expect(again.body).toEqual({ status: "existing", threadId: `${T}a`, messageId: "m1" });
  });

  it("records one receipt for the claim, and refuses a receipt for another message", async () => {
    const row = await prisma.inboxReply.findFirstOrThrow({ where: { gmailThreadId: `${T}a` } });
    const wrong = await post("complete", { claimId: row.claimId, threadId: `${T}b`, messageId: "m1", status: "send_skipped" });
    expect(wrong.body).toMatchObject({ recorded: false });
    const ok = await post("complete", { claimId: row.claimId, threadId: `${T}a`, messageId: "m1", status: "send_skipped", sentMessageId: "s1", queue: "customer_support", priority: "normal", reason: null });
    expect(ok.body).toEqual({ recorded: true, status: "send_skipped", duplicate: false });
    const retry = await post("complete", { claimId: row.claimId, threadId: `${T}a`, messageId: "m1", status: "needs_human_review" });
    expect(retry.body).toMatchObject({ recorded: true, status: "send_skipped", duplicate: true });
    expect((await post("complete", { claimId: row.claimId, threadId: `${T}a`, messageId: "m1", status: "deleted" })).status).toBe(400);
  });

  it("queues review items for a person, never over a sent reply", async () => {
    expect((await post("review", { threadId: `${T}c`, messageId: "m9", reason: "account_security", queue: "trust_and_safety", priority: "urgent" })).body).toEqual({ queued: true, status: "needs_human_review" });
    expect((await post("review", { threadId: `${T}a`, messageId: "m1", reason: "x" })).body).toEqual({ queued: false, status: "send_skipped" });
    const list = (await listInboxForReview()).filter((r) => r.gmailThreadId.startsWith(T));
    expect(list.map((r) => [r.gmailThreadId, r.reason, r.priority])).toEqual([[`${T}c`, "account_security", "urgent"]]);
  });

  it("lists a claim that never got its receipt after 30 minutes, until staff mark it handled", async () => {
    const row = await prisma.inboxReply.create({
      data: { gmailThreadId: `${T}d`, gmailMessageId: "m5", createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    const ids = (await listInboxForReview()).map((r) => r.id);
    expect(ids).toContain(row.id);
    expect(await markInboxReviewed(row.id)).toBe(true);
    expect(await markInboxReviewed(row.id)).toBe(false);
    expect((await listInboxForReview()).map((r) => r.id)).not.toContain(row.id);
  });
});
