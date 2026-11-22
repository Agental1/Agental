import { prisma } from "@/lib/db";

/**
 * The bell (round 8): the latest notifications of one person (written by the
 * database triggers in 20261208000000_round8_notifications) and the staff
 * announcements for their audience, newest first, with what is unread.
 * In-app only: nothing here sends an email, a text or a push.
 */
export type BellKind = "ROLE_FOUND" | "MESSAGE" | "STATUS" | "UPDATE";

export interface BellItem {
  id: string;
  /** "n:<id>" for a notification, "a:<id>" for an announcement. */
  key: string;
  kind: BellKind;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const LIMIT = 20;

function parse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export async function bellFor(userId: string, portal: "TALENT" | "CASTING"): Promise<{ items: BellItem[]; unread: number }> {
  const [notes, unreadNotes, announcements] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.announcement.findMany({
      where: { archivedAt: null, audience: { in: ["ALL", portal] } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { reads: { where: { userId }, select: { userId: true } } },
    }),
  ]);
  const items: BellItem[] = [
    ...notes.map((n) => ({
      id: n.id,
      key: `n:${n.id}`,
      kind: (["ROLE_FOUND", "MESSAGE", "STATUS"].includes(n.kind) ? n.kind : "STATUS") as BellKind,
      title: n.title ?? n.kind,
      body: n.body,
      link: n.link,
      payload: parse(n.payload),
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    })),
    ...announcements.map((a) => ({
      id: a.id,
      key: `a:${a.id}`,
      kind: "UPDATE" as const,
      title: a.title,
      body: a.body,
      link: a.link,
      payload: {},
      read: a.reads.length > 0,
      createdAt: a.createdAt.toISOString(),
    })),
  ]
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    .slice(0, LIMIT);
  const unreadAnnouncements = announcements.filter((a) => a.reads.length === 0).length;
  return { items, unread: unreadNotes + unreadAnnouncements };
}

export async function markAllRead(userId: string, portal: "TALENT" | "CASTING"): Promise<void> {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: { archivedAt: null, audience: { in: ["ALL", portal] } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } }),
    prisma.announcementRead.createMany({
      data: announcements.map((a) => ({ announcementId: a.id, userId, readAt: now })),
      skipDuplicates: true,
    }),
  ]);
}

/** One item read (on click). Only the owner's own notification can be marked. */
export async function markOneRead(userId: string, key: string): Promise<void> {
  const [type, id] = key.split(":");
  if (!id) return;
  if (type === "n") {
    await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  } else if (type === "a") {
    await prisma.announcementRead.createMany({ data: [{ announcementId: id, userId }], skipDuplicates: true });
  }
}
