import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 9, group 6: the automatic emails against the local database, the
 * mailer faked. Only Test accounts in test mode; once each (claimed before
 * sending); a digest at most once a day; replies only after an hour unread;
 * each email unsubscribes from its own category with a signed link.
 */
const P = "test-r9auto-";
const sent: { to: string; kind?: string; subject: string; text: string; html: string; headers?: Record<string, string> }[] = [];
vi.mock("@/lib/mailer", () => ({
  emailSenderConfigured: () => true,
  sendEmail: async (m: (typeof sent)[number]) => (sent.push(m), { ok: true, mode: "resend" }),
}));

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const { runAutoEmails } = await import("@/lib/auto-emails");
const { applyUnsubscribe, unsubscribeToken, unsubscribeTokenValid } = await import("@/lib/email-unsubscribe");
const env = { NEXT_PUBLIC_SITE_URL: "https://www.agental.co", RESEND_API_KEY: "x", EMAIL_FROM: "x" };
const all = new Set(["roles_found", "application_update", "message_reply", "welcome"] as const);
const HOUR = 60 * 60 * 1000;
const ids: Record<string, string> = {};

describe.skipIf(!local)("automatic emails", () => {
  beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-long-enough-1234567890");
    vi.stubEnv("WORKFLOW_MODE", "");
    // Earlier rows in the local database stay out of these runs.
    await prisma.notification.updateMany({ where: { emailedAt: null }, data: { emailedAt: new Date(0) } });
    await prisma.message.updateMany({ where: { emailedAt: null }, data: { emailedAt: new Date(0) } });
    await prisma.user.updateMany({ where: { welcomeEmailAt: null }, data: { welcomeEmailAt: new Date(0) } });
    for (const [n, status, channel] of [["test", "TEST", "email"], ["real", "UNREVIEWED", "email"], ["sms", "TEST", "sms"]] as const) {
      const u = await prisma.user.create({
        data: { email: `${P}${n}@test.local`, name: `Legal ${n}`, kind: "TALENT", accountStatus: status, emailVerified: new Date(), locale: "en" },
      });
      ids[n] = u.id;
      await prisma.artistProfile.create({ data: { userId: u.id, stageName: `Mia ${n}`, roleAlertChannel: channel } });
    }
  });
  beforeEach(() => {
    sent.length = 0;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("welcomes a verified Test account once, and nobody else in test mode", async () => {
    const r1 = await runAutoEmails({ env, approved: all });
    expect(r1.welcome).toBe(2); // "test" and "sms" are Test accounts
    expect(sent.map((m) => m.to).sort()).toEqual([`${P}sms@test.local`, `${P}test@test.local`]);
    const w = sent.find((m) => m.to === `${P}test@test.local`)!;
    expect(w.subject).toBe("Welcome to Agental");
    expect(w.html).toContain("Welcome, Mia");
    expect(w.html).toContain("https://www.agental.co/apple-icon");
    expect(w.html).not.toContain("—");
    expect(w.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(w.headers?.["List-Unsubscribe"]).toContain("/api/email/unsubscribe?");
    sent.length = 0;
    expect((await runAutoEmails({ env, approved: all })).welcome).toBe(0);
  });

  it("sends an application update, including declined", async () => {
    await prisma.notification.create({ data: { userId: ids.test, kind: "STATUS", payload: JSON.stringify({ role: "Blue Hour", status: "REJECTED" }) } });
    await prisma.notification.create({ data: { userId: ids.real, kind: "STATUS", payload: JSON.stringify({ role: "Blue Hour", status: "INVITED" }) } });
    const r = await runAutoEmails({ env, approved: all });
    expect(r.application_update).toBe(1);
    expect(sent[0]).toMatchObject({ to: `${P}test@test.local`, kind: "application_update", subject: "Update on Blue Hour" });
    expect(sent[0].text).toContain("went another way for Blue Hour");
  });

  it("emails an unread reply only after an hour, once", async () => {
    const thread = await prisma.thread.create({ data: { userId: ids.test, kind: "TEAM" } });
    await prisma.message.create({ data: { threadId: thread.id, body: "Hi", fromAgent: true, createdAt: new Date(Date.now() - 30 * 60 * 1000) } });
    expect((await runAutoEmails({ env, approved: all })).message_reply).toBe(0);
    await prisma.message.create({ data: { threadId: thread.id, body: "Team here", fromTeam: true, createdAt: new Date(Date.now() - 2 * HOUR) } });
    const r = await runAutoEmails({ env, approved: all });
    expect(r.message_reply).toBe(1);
    expect(sent[0].text).toContain("Unread replies from the Agental team: 1.");
    expect((await runAutoEmails({ env, approved: all })).message_reply).toBe(0);
  });

  it("sends one roles digest a day, by email only when the preference says so", async () => {
    for (const role of ["Lead A", "Lead B", "Lead C"]) {
      await prisma.notification.create({ data: { userId: ids.test, kind: "ROLE_FOUND", payload: JSON.stringify({ role }) } });
      await prisma.notification.create({ data: { userId: ids.sms, kind: "ROLE_FOUND", payload: JSON.stringify({ role }) } });
    }
    const r = await runAutoEmails({ env, approved: all });
    expect(r.roles_found).toBe(1);
    expect(sent[0].to).toBe(`${P}test@test.local`);
    expect(sent[0].text).toContain("New roles found by your AI agent: 3");
    expect(sent[0].text).toContain("- Lead A");
    await prisma.notification.create({ data: { userId: ids.test, kind: "ROLE_FOUND", payload: JSON.stringify({ role: "Lead D" }) } });
    expect((await runAutoEmails({ env, approved: all })).roles_found).toBe(0);
    expect((await runAutoEmails({ env, approved: all, now: new Date(Date.now() + 25 * HOUR) })).roles_found).toBe(1);
  });

  it("unsubscribes one category with a signed link, and refuses a forged one", async () => {
    const tok = unsubscribeToken(ids.test, "roles_found");
    expect(unsubscribeTokenValid(ids.test, "roles_found", tok)).toBe(true);
    expect(unsubscribeTokenValid(ids.real, "roles_found", tok)).toBe(false);
    expect(unsubscribeTokenValid(ids.test, "application_update", tok)).toBe(false);
    expect(await applyUnsubscribe(ids.test, "roles_found", "x".repeat(32))).toBe(false);
    expect(await applyUnsubscribe(ids.test, "roles_found", tok)).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.test } });
    expect(u.notifyRolesFound).toBe(false);
    expect(u.notifyApplications).toBe(true);
  });

  it("sends no category staff did not approve", async () => {
    await prisma.notification.create({ data: { userId: ids.test, kind: "STATUS", payload: JSON.stringify({ role: "Y", status: "INVITED" }) } });
    expect(await runAutoEmails({ env, approved: new Set() })).toMatchObject({ skipped: true });
    expect((await runAutoEmails({ env, approved: new Set(["welcome"] as const) })).application_update).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when paused", async () => {
    await prisma.notification.create({ data: { userId: ids.test, kind: "STATUS", payload: JSON.stringify({ role: "X", status: "INVITED" }) } });
    expect(await runAutoEmails({ env, approved: all, paused: true })).toMatchObject({ skipped: true, application_update: 0 });
    expect(sent).toHaveLength(0);
  });
});
