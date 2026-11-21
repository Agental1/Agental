import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Human Messages against the real database, with two performers and one
 * admin. What is under test is who can read and write what: each performer
 * has one thread with the team and can reach no other, a retry stores one
 * message, and the team side answers only to an admin.
 *
 * Every row carries the prefix below and is removed in afterAll.
 */
const P = "test-messages-";

const session = vi.fn();
type Mail = { to: string; subject: string; text: string; html: string };
const sendEmail = vi.fn(async (mail: Mail) => {
  void mail;
  return { ok: true as const, mode: "log" as const };
});
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendEmail }));

const { sendMessage, replyAsTeam, markThreadRead, markMyThreadRead } = await import(
  "@/app/actions/messages"
);
const { getMyThread, listTeamThreads, getTeamThread } = await import("@/lib/messages");

let maya: string;
let leo: string;
let admin: string;
let casting: string;

const as = (id: string, kind = "TALENT") => session.mockResolvedValue({ user: { id, kind } });
const key = (n: number) => `${P}key-${String(n).padStart(8, "0")}`;

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!local)("human Messages", () => {
  beforeAll(async () => {
    const make = (name: string, data: Record<string, unknown> = {}) =>
      prisma.user.create({
        data: { email: `${P}${name}@test.local`, name, kind: "TALENT", ...data },
      });
    maya = (await make("maya")).id;
    leo = (await make("leo")).id;
    admin = (await make("admin", { isAdmin: true })).id;
    casting = (await make("casting", { kind: "CASTING" })).id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: P } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    // Threads cascade from their user; messages cascade from their thread.
    await prisma.rateLimitEvent.deleteMany({
      where: { OR: [{ key: { in: ids.map((id) => `msg:${id}`) } }, { key: { startsWith: "msg-alert:" } }] },
    });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  beforeEach(() => {
    session.mockReset();
    sendEmail.mockClear();
    delete process.env.TEAM_INBOX_EMAIL;
  });

  it("refuses a signed-out visitor and a casting account", async () => {
    session.mockResolvedValue(null);
    expect(await sendMessage({ body: "Hi", clientKey: key(1), topic: "other" })).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    as(casting, "CASTING");
    expect(await sendMessage({ body: "Hi", clientKey: key(1), topic: "other" })).toMatchObject({ ok: false });
    expect(await prisma.thread.count({ where: { userId: casting } })).toBe(0);
  });

  it("stores a first message and shows the same thread after a reload", async () => {
    as(maya);
    const sent = await sendMessage({ body: "  Hello, I have a question.  ", clientKey: key(2), topic: "other" });
    expect(sent).toMatchObject({ ok: true });
    if (!sent.ok) return;

    const thread = await getMyThread(maya);
    expect(thread.threadId).toBe(sent.threadId);
    // The performer's message, then the assistant's answer.
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]).toMatchObject({
      id: sent.messageId,
      body: "Hello, I have a question.",
      fromTeam: false,
      fromAgent: false,
      topic: "other",
      readAt: null,
    });
    expect(thread.messages[1]).toMatchObject({ fromTeam: false, fromAgent: true });
    // Nothing about who wrote it is exposed beyond the side.
    expect(Object.keys(thread.messages[0]).sort()).toEqual(
      ["body", "createdAt", "fromAgent", "fromTeam", "id", "readAt", "topic"].sort()
    );
  });

  it("stores one message when the same draft is sent twice", async () => {
    as(maya);
    const first = await sendMessage({ body: "Sent once", clientKey: key(3), topic: "other" });
    const again = await sendMessage({ body: "Sent once", clientKey: key(3), topic: "other" });
    expect(first).toMatchObject({ ok: true });
    expect(again).toEqual(first);
    const rows = await prisma.message.count({ where: { clientKey: key(3) } });
    expect(rows).toBe(1);
  });

  it("keeps one thread per performer, whatever the number of messages", async () => {
    as(maya);
    await sendMessage({ body: "Another one", clientKey: key(4), topic: "other" });
    expect(await prisma.thread.count({ where: { userId: maya, kind: "TEAM" } })).toBe(1);
  });

  it("keeps two performers apart", async () => {
    as(leo);
    const sent = await sendMessage({ body: "Leo here", clientKey: key(5), topic: "other" });
    expect(sent).toMatchObject({ ok: true });

    const mine = await getMyThread(leo);
    const hers = await getMyThread(maya);
    expect(mine.threadId).not.toBe(hers.threadId);
    expect(mine.messages.filter((m) => !m.fromAgent).map((m) => m.body)).toEqual(["Leo here"]);
    expect(hers.messages.map((m) => m.body)).not.toContain("Leo here");

    // A performer is not the team: the team side gives them nothing, and they
    // cannot write into, or mark, another performer's thread.
    expect(await listTeamThreads(leo)).toEqual([]);
    expect(await getTeamThread(leo, hers.threadId!)).toBeNull();
    expect(await replyAsTeam(hers.threadId!, { body: "Pretending", clientKey: key(6) })).toEqual({
      ok: false,
      error: { key: "errors.unauthorized" },
    });
    expect(await markThreadRead(hers.threadId!)).toMatchObject({ ok: false });
    expect((await getMyThread(maya)).messages.map((m) => m.body)).not.toContain("Pretending");
  });

  it("shows the team every conversation and lets an admin answer", async () => {
    const inbox = await listTeamThreads(admin);
    const mayaRow = inbox.find((row) => row.user.id === maya);
    expect(mayaRow).toMatchObject({ awaitingReply: true });
    expect(mayaRow!.unread).toBeGreaterThanOrEqual(1);
    expect(inbox.some((row) => row.user.id === leo)).toBe(true);

    as(admin);
    const reply = await replyAsTeam(mayaRow!.threadId, { body: "Thanks Maya.", clientKey: key(7) });
    expect(reply).toMatchObject({ ok: true, threadId: mayaRow!.threadId });
    // The same reply sent again stores nothing new.
    expect(await replyAsTeam(mayaRow!.threadId, { body: "Thanks Maya.", clientKey: key(7) })).toEqual(
      reply
    );

    const after = (await listTeamThreads(admin)).find((row) => row.user.id === maya);
    expect(after).toMatchObject({ awaitingReply: false, unread: 0, preview: "Thanks Maya." });

    const forMaya = await getMyThread(maya);
    const last = forMaya.messages.at(-1)!;
    expect(last).toMatchObject({ body: "Thanks Maya.", fromTeam: true, readAt: null });
    // Leo still sees only his own conversation.
    expect((await getMyThread(leo)).messages.filter((m) => !m.fromAgent).map((m) => m.body)).toEqual(["Leo here"]);

    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: admin, action: "message.team.reply" },
    });
    expect(audit?.resourceId).toBe(mayaRow!.threadId);
    expect(audit?.after).not.toContain("Thanks Maya");
  });

  it("marks the team's reply as read when the performer opens Messages", async () => {
    as(maya);
    expect(await markMyThreadRead()).toEqual({ ok: true });
    const thread = await getMyThread(maya);
    expect(thread.messages.filter((m) => m.fromTeam).every((m) => m.readAt !== null)).toBe(true);
    // Her own messages are marked by the team, not by her.
    as(leo);
    await markMyThreadRead();
    expect((await getMyThread(leo)).messages[0].readAt).toBeNull();
  });

  it("answers 'not found' for a thread that does not exist", async () => {
    as(admin);
    expect(await replyAsTeam("nope", { body: "x", clientKey: key(8) })).toEqual({
      ok: false,
      error: { key: "errors.notFound" },
    });
    expect(await getTeamThread(admin, "nope")).toBeNull();
  });

  it("alerts the team inbox with the thread id only, and at most once per ten minutes", async () => {
    process.env.TEAM_INBOX_EMAIL = "inbox@test.local";
    as(leo);
    await sendMessage({ body: "Private details here", clientKey: key(9), topic: "other" });
    await sendMessage({ body: "And more", clientKey: key(10), topic: "other" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("inbox@test.local");
    for (const part of [mail.text, mail.html]) {
      expect(part).not.toContain("Private details");
      expect(part).not.toContain("leo");
      expect(part).not.toContain("@");
    }
  });

  it("still stores the message when the alert mail fails", async () => {
    process.env.TEAM_INBOX_EMAIL = "inbox@test.local";
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    await prisma.rateLimitEvent.deleteMany({ where: { key: { startsWith: "msg-alert:" } } });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    as(maya);
    const sent = await sendMessage({ body: "Stored anyway", clientKey: key(11), topic: "other" });
    quiet.mockRestore();
    expect(sent).toMatchObject({ ok: true });
    expect((await getMyThread(maya)).messages.map((m) => m.body)).toContain("Stored anyway");
  });

  it("slows down an account that sends too many messages", async () => {
    as(leo);
    let refused = 0;
    for (let i = 0; i < 25; i += 1) {
      const result = await sendMessage({ body: `burst ${i}`, clientKey: key(100 + i), topic: "other" });
      if (!result.ok && result.error.key === "errors.tooManyAttempts") refused += 1;
    }
    expect(refused).toBeGreaterThan(0);
    expect((await getMyThread(leo)).messages.filter((m) => !m.fromAgent).length).toBeLessThanOrEqual(20);
  });
});
