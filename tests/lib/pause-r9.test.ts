import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 9, group 9: one switch pauses everything automatic at once (search
 * claims, drafted replies, the assistant's model, automatic emails), audited;
 * a workflow failing again and again alerts once a day; the AI spend falls back
 * on the cost the app recorded.
 */
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const SECRET = "test-n8n-secret-with-enough-length-r9-g9";
vi.mock("@/lib/mailer", () => ({ emailSenderConfigured: () => true, sendEmail: async () => ({ ok: true, mode: "resend" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const P = "test-r9pause-";

describe.skipIf(!local)("pause switch and AI accounts", () => {
  let adminId = "";
  let saved: { value: string; updatedById: string | null } | null = null;
  beforeAll(async () => {
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    saved = await prisma.appSetting.findUnique({ where: { key: "pause" }, select: { value: true, updatedById: true } });
    adminId = (await prisma.user.create({ data: { email: `${P}admin@test.local`, isAdmin: true, accountStatus: "STAFF" } })).id;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (saved) await prisma.appSetting.update({ where: { key: "pause" }, data: saved });
    else await prisma.appSetting.deleteMany({ where: { key: "pause" } });
    await prisma.notification.deleteMany({ where: { userId: adminId } });
    await prisma.roleSearchRequest.deleteMany({ where: { error: `${P}failure` } });
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: P } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("pauses and resumes, audited", async () => {
    const { setPaused, isPaused } = await import("@/lib/app-settings");
    await setPaused(adminId, true);
    expect(await isPaused()).toBe(true);
    expect(await prisma.auditLog.count({ where: { actorUserId: adminId, action: "admin.pause.on" } })).toBe(1);
  });

  it("while paused: no search claimed, no draft taken, no automatic email, rules answers", async () => {
    const call = async (path: string, body: unknown) => {
      const route = await import(`@/app/api/n8n/${path}/route`);
      return route.POST(new Request(`https://app.test/api/n8n/${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` }, body: JSON.stringify(body) }));
    };
    const claim = await call("casting/claim", { limit: 5, executionId: "pausetest" });
    expect(await claim.json()).toMatchObject({ jobs: [], paused: true });
    expect((await call("inbox/claim", { threadId: "t1", messageId: "m1" })).status).toBe(503);
    expect((await call("inbox/draft", {})).status).toBe(503);
    const { runAutoEmails } = await import("@/lib/auto-emails");
    expect(await runAutoEmails({ approved: new Set(["welcome"] as const), env: { RESEND_API_KEY: "x", EMAIL_FROM: "x" } })).toMatchObject({ skipped: true });
  });

  it("resumes", async () => {
    const { setPaused, isPaused } = await import("@/lib/app-settings");
    await setPaused(adminId, false);
    expect(await isPaused()).toBe(false);
  });

  it("alerts once a day when the casting workflow fails again and again", async () => {
    const u = await prisma.user.create({ data: { email: `${P}perf@test.local` } });
    for (let i = 1; i <= 3; i++) {
      await prisma.roleSearchRequest.create({ data: { userId: u.id, plan: "FREE", periodKey: "r9", seq: i, status: "failed", completedAt: new Date(), error: `${P}failure` } });
    }
    // Today's alert from an earlier local run would (rightly) stop a second one.
    await prisma.notification.deleteMany({ where: { kind: "ALERT", payload: { contains: '"workflow_failures"' } } });
    const { alertRepeatedFailures } = await import("@/lib/admin/ai-report");
    expect(await alertRepeatedFailures()).toBe(true);
    expect(await alertRepeatedFailures()).toBe(false);
    expect(await prisma.notification.count({ where: { userId: adminId, title: { contains: "failed 3 times" } } })).toBe(1);
  });

  it("counts the cost the app recorded when the provider cannot be read", async () => {
    await prisma.aiUsage.create({ data: { provider: "perplexity", kind: "casting.search", ref: `${P}x`, costMicroUsd: 1_234_567 } });
    const { recordedSpendCents } = await import("@/lib/ai-spend");
    expect(await recordedSpendCents("perplexity", new Date(Date.now() - 60_000))).toBe(124);
  });
});
