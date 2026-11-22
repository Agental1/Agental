import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { bellFor, markAllRead, markOneRead } from "@/lib/notifications";

/**
 * Round 8 bell: a reply from the team creates a notification through the
 * database trigger (so replies written later, by n8n or staff, notify without
 * touching n8n), and announcements reach their audience with a read state.
 * Runs on the local database only.
 */
const tag = `test-r8-bell-${Date.now()}`;
let userId = "";
let other = "";
const announcementIds: string[] = [];

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `${tag}@example.test`, kind: "TALENT" } })).id;
  other = (await prisma.user.create({ data: { email: `${tag}-b@example.test`, kind: "TALENT" } })).id;
});

afterAll(async () => {
  await prisma.announcement.deleteMany({ where: { id: { in: announcementIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, other] } } });
});

describe("notification triggers and the bell", () => {
  it("a team or assistant reply notifies the thread's owner; the performer's own message does not", async () => {
    const thread = await prisma.thread.create({ data: { kind: "TEAM", userId } });
    await prisma.message.create({ data: { threadId: thread.id, body: "Hi team", senderId: userId } });
    await prisma.message.create({ data: { threadId: thread.id, body: "Here is your answer", fromTeam: true } });
    await prisma.message.create({ data: { threadId: thread.id, body: "Assistant here", fromAgent: true } });
    const notes = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.kind)).toEqual(["MESSAGE", "MESSAGE"]);
    expect(notes[0]).toMatchObject({ link: "/talents/app/messages", body: "Here is your answer" });
  });

  it("shows announcements to their audience only, and marks everything read", async () => {
    const a = await prisma.announcement.create({ data: { title: "New: tiles", body: "Physical tab", audience: "TALENT" } });
    const c = await prisma.announcement.create({ data: { title: "Casting only", body: "x", audience: "CASTING" } });
    announcementIds.push(a.id, c.id);
    const before = await bellFor(userId, "TALENT");
    expect(before.items.some((i) => i.key === `a:${a.id}`)).toBe(true);
    expect(before.items.some((i) => i.key === `a:${c.id}`)).toBe(false);
    expect(before.unread).toBeGreaterThanOrEqual(3);

    await markAllRead(userId, "TALENT");
    const after = await bellFor(userId, "TALENT");
    expect(after.unread).toBe(0);
    // Someone else's state is untouched.
    expect((await bellFor(other, "TALENT")).unread).toBeGreaterThanOrEqual(1);
  });

  it("marks one item read, and never another person's notification", async () => {
    const mine = await prisma.notification.create({ data: { userId: other, kind: "STATUS", title: "x" } });
    await markOneRead(userId, `n:${mine.id}`);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).toBeNull();
    await markOneRead(other, `n:${mine.id}`);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
  });
});
