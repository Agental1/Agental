import { prisma } from "@/lib/db";

/**
 * The admin data hub: every account with the facts the team asks about, and
 * one account's timeline. Server only; every caller checks currentAdminId().
 */

export interface AccountFilters {
  q?: string;
  audience?: "TALENT" | "CASTING";
  plan?: string;
  method?: "email" | "google";
  verified?: "yes" | "no";
}

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  audience: string;
  plan: string;
  createdAt: Date;
  method: "email" | "google" | "other";
  emailVerified: boolean;
  completeness: number | null;
  mediaCount: number;
  website: "none" | "draft" | "published";
}

export async function listAccounts(f: AccountFilters = {}, take = 500): Promise<AccountRow[]> {
  const q = f.q?.trim();
  const users = await prisma.user.findMany({
    where: {
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
      ...(f.audience ? { kind: f.audience } : {}),
      ...(f.verified === "yes" ? { emailVerified: { not: null } } : f.verified === "no" ? { emailVerified: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      email: true,
      kind: true,
      createdAt: true,
      emailVerified: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
      artistProfile: { select: { id: true, stageName: true, completenessScore: true, _count: { select: { media: true } } } },
      sites: { select: { status: true } },
    },
  });
  const subs = await prisma.subscription.findMany({
    where: { subjectType: "ARTIST", subjectId: { in: users.map((u) => u.id) } },
    select: { subjectId: true, plan: true, compPlan: true, compUntil: true, status: true },
  });
  const planOf = new Map(
    subs.map((s) => [
      s.subjectId,
      s.status !== "ACTIVE" ? "FREE" : s.plan === "FREE" && s.compPlan && s.compUntil && s.compUntil > new Date() ? s.compPlan : s.plan,
    ])
  );
  const rows: AccountRow[] = users.map((u) => ({
    id: u.id,
    name: u.artistProfile?.stageName || u.name || "",
    email: u.email,
    audience: u.kind,
    plan: u.kind === "TALENT" ? (planOf.get(u.id) ?? "FREE") : "",
    createdAt: u.createdAt,
    method: u.accounts.some((a) => a.provider === "google") ? "google" : u.passwordHash ? "email" : "other",
    emailVerified: !!u.emailVerified || (!u.passwordHash && u.accounts.length > 0),
    completeness: u.artistProfile?.completenessScore ?? null,
    mediaCount: u.artistProfile?._count.media ?? 0,
    website: u.sites.some((s) => s.status === "PUBLISHED") ? "published" : u.sites.length > 0 ? "draft" : "none",
  }));
  return rows.filter((r) => (!f.plan || r.plan === f.plan) && (!f.method || r.method === f.method));
}

export type TimelineKind = "signup" | "verified" | "audit" | "media" | "search" | "message" | "limelight" | "plan";

export interface TimelineEvent {
  at: Date;
  kind: TimelineKind;
  detail?: string;
  mediaId?: string;
}

export async function accountTimeline(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      kind: true,
      createdAt: true,
      emailVerified: true,
      artistProfile: { select: { id: true, stageName: true, completenessScore: true } },
    },
  });
  if (!user) return null;
  const profileId = user.artistProfile?.id;
  const [audits, media, searches, messages, leads, sub] = await Promise.all([
    prisma.auditLog.findMany({
      where: { OR: [{ actorUserId: userId }, { resourceId: userId }, ...(profileId ? [{ resourceId: profileId }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { createdAt: true, action: true, resourceType: true },
    }),
    profileId
      ? prisma.media.findMany({
          where: { profileId },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, type: true, destination: true },
        })
      : [],
    prisma.roleSearchRequest.findMany({ where: { userId }, select: { createdAt: true, status: true } }),
    prisma.message.findMany({
      where: { thread: { userId } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { createdAt: true, fromTeam: true, fromAgent: true },
    }),
    prisma.limelightLead.findMany({ where: { email: user.email }, select: { firstSeenAt: true, status: true } }),
    prisma.subscription.findUnique({ where: { subjectId: userId }, select: { plan: true, createdAt: true, updatedAt: true } }),
  ]);
  const events: TimelineEvent[] = [{ at: user.createdAt, kind: "signup" }];
  if (user.emailVerified) events.push({ at: user.emailVerified, kind: "verified" });
  for (const a of audits) if (a.action !== "user.signup") events.push({ at: a.createdAt, kind: "audit", detail: a.action });
  for (const m of media) events.push({ at: m.createdAt, kind: "media", detail: `${m.type} · ${m.destination}`, mediaId: m.id });
  for (const s of searches) events.push({ at: s.createdAt, kind: "search", detail: s.status });
  for (const m of messages)
    events.push({ at: m.createdAt, kind: "message", detail: m.fromTeam ? "team" : m.fromAgent ? "assistant" : "performer" });
  for (const l of leads) events.push({ at: l.firstSeenAt, kind: "limelight", detail: l.status });
  if (sub) events.push({ at: sub.updatedAt, kind: "plan", detail: sub.plan });
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { user, events };
}

/** RFC 4180 CSV, with formula-looking cells neutralized for spreadsheets. */
export function accountsCsv(rows: AccountRow[]): string {
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["id", "name", "email", "audience", "plan", "created_at", "signup", "email_verified", "completeness", "media", "website"];
  const lines = rows.map((r) =>
    [r.id, r.name, r.email, r.audience, r.plan, r.createdAt, r.method, r.emailVerified, r.completeness ?? "", r.mediaCount, r.website]
      .map(cell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
