import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Round 8d: several conversations per performer, "New conversation", and
 * delete for the performer only (the team keeps the rows).
 */
const P = "test-conv8d-";

const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendEmail: vi.fn(async () => ({ ok: true, mode: "log" })) }));

const { sendMessage, deleteMyConversation } = await import("@/app/actions/messages");
const { getMyThread, listMyConversations, listTeamThreads, getTeamThread } = await import("@/lib/messages");

let maya: string;
let leo: string;
let admin: string;
const as = (id: string) => session.mockResolvedValue({ user: { id, kind: "TALENT" } });
const key = (n: number) => `${P}key-${String(n).padStart(8, "0")}`;
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

describe.skipIf(!local)("round 8d conversations", () => {
  beforeAll(async () => {
    const make = (name: string, data: Record<string, unknown> = {}) =>
      prisma.user.create({ data: { email: `${P}${name}@test.local`, name, kind: "TALENT", ...data } });
    maya = (await make("maya")).id;
    leo = (await make("leo")).id;
    admin = (await make("admin", { isAdmin: true })).id;
  });

  afterAll(async () => {
    const ids = (await prisma.user.findMany({ where: { email: { startsWith: P } }, select: { id: true } })).map((u) => u.id);
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.map((id) => `msg:${id}`) } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  beforeEach(() => session.mockReset());

  it("starts a new conversation titled from its first message, and lists both", async () => {
    as(maya);
    const first = await sendMessage({ body: "About my headshots", clientKey: key(1), topic: "profile", conversationId: "new" });
    expect(first.ok).toBe(true);
    const second = await sendMessage({ body: "A question about an application", clientKey: key(2), topic: "application", conversationId: "new" });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.threadId).not.toBe(second.threadId);

    const list = await listMyConversations(maya);
    expect(list.map((c) => c.title)).toEqual(["A question about an application", "About my headshots"]);

    // Continue the first one by id.
    const more = await sendMessage({ body: "Follow-up", clientKey: key(3), topic: "profile", conversationId: first.threadId });
    expect(more.ok && more.threadId).toBe(first.threadId);
    const opened = await getMyThread(maya, undefined, first.threadId);
    expect(opened.messages.filter((m) => !m.fromAgent).map((m) => m.body)).toEqual(["About my headshots", "Follow-up"]);
  });

  it("a retried first message does not open a second conversation", async () => {
    as(leo);
    const a = await sendMessage({ body: "Hello", clientKey: key(10), topic: "other", conversationId: "new" });
    const b = await sendMessage({ body: "Hello", clientKey: key(10), topic: "other", conversationId: "new" });
    expect(a.ok && b.ok && a.threadId === b.threadId).toBe(true);
    expect((await listMyConversations(leo)).length).toBe(1);
  });

  it("refuses someone else's conversation id", async () => {
    const mine = (await listMyConversations(maya))[0].threadId;
    as(leo);
    expect(await sendMessage({ body: "Sneaky", clientKey: key(20), topic: "other", conversationId: mine })).toMatchObject({ ok: false });
    expect(await deleteMyConversation(mine)).toMatchObject({ ok: false });
    expect((await getMyThread(leo, undefined, mine)).messages.map((m) => m.body)).not.toContain("About my headshots");
  });

  it("delete hides it from the performer at once and keeps it for the team", async () => {
    as(maya);
    const [latest] = await listMyConversations(maya);
    expect(await deleteMyConversation(latest.threadId)).toEqual({ ok: true });
    expect((await listMyConversations(maya)).map((c) => c.threadId)).not.toContain(latest.threadId);
    expect((await getMyThread(maya, undefined, latest.threadId)).threadId).not.toBe(latest.threadId);
    expect(await sendMessage({ body: "Back?", clientKey: key(30), topic: "other", conversationId: latest.threadId })).toMatchObject({ ok: false });

    // Rows kept, shown to the team as deleted.
    expect(await prisma.message.count({ where: { threadId: latest.threadId } })).toBeGreaterThan(0);
    const row = (await listTeamThreads(admin)).find((r) => r.threadId === latest.threadId);
    expect(row?.hiddenForUser).toBe(true);
    expect((await getTeamThread(admin, latest.threadId))?.hiddenForUser).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "message.conversation.delete", resourceId: latest.threadId } })).toBe(1);
  });
});
