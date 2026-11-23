import { prisma } from "@/lib/db";
import { COMPLETENESS_SELECT, completenessOf } from "@/lib/completeness";
import { ELIGIBILITY_SELECT, factsFrom } from "@/lib/agents";
import { agentsEnabled, isAccountStatus, workflowMode, type AccountStatus } from "@/domain/workflow/eligibility";
import { searchAccess } from "@/lib/app-settings";
import { removalBlock, type RemovalBlock } from "@/domain/account-removal";
import { paidUserIds } from "@/lib/admin/account-removal";

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
  status?: AccountStatus;
  agents?: "yes" | "no";
  /**
   * Round 9: the groups the counts show, so every count opens exactly its own
   * list. performers / casting: real accounts (not staff, test or spam);
   * staff: status STAFF or an admin; test; spam: spam or revoked.
   */
  group?: AccountGroup;
  /** Created before this day (YYYY-MM-DD, UTC). */
  createdBefore?: string;
  /** yes: never paid and in no organization; no: paid or in one. */
  neverPaid?: "yes" | "no";
  /** never: no sign-in recorded (recorded since round 9); before: last sign-in before signedInBefore. */
  lastSignIn?: "never" | "before";
  signedInBefore?: string;
  sort?: AccountSort;
  dir?: "asc" | "desc";
}

export const ACCOUNT_GROUPS = ["performers", "casting", "staff", "test", "spam", "unreviewed"] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];
export const ACCOUNT_SORTS = ["name", "email", "created", "lastSignIn", "status", "plan", "completeness"] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  audience: string;
  plan: string;
  createdAt: Date;
  method: "email" | "google" | "other";
  emailVerified: boolean;
  /** When the real verification happened; epoch 0 for a Google account; null when not verified. */
  verifiedAt: Date | null;
  status: AccountStatus;
  isAdmin: boolean;
  agentsEnabled: boolean;
  completeness: number | null;
  mediaCount: number;
  website: "none" | "draft" | "published";
  lastSignInAt: Date | null;
  paid: boolean;
  /** Why the row cannot be ticked for Delete or the warning (null: it can). */
  block: RemovalBlock | null;
}

const isDay = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : undefined);

/** Read a filter set from URL parameters (page and CSV route share it). */
export function accountFiltersFrom(get: (k: string) => string | null | undefined): AccountFilters {
  const one = (k: string) => get(k) || undefined;
  const audience = one("audience");
  const method = one("method");
  const verified = one("verified");
  const status = one("status");
  const agents = one("agents");
  const plan = one("plan");
  const group = one("group");
  const neverPaid = one("neverPaid");
  const lastSignIn = one("lastSignIn");
  const sort = one("sort");
  const dir = one("dir");
  return {
    q: one("q")?.slice(0, 100),
    audience: audience === "TALENT" || audience === "CASTING" ? audience : undefined,
    plan: plan && ["FREE", "PRO", "PREMIUM", "ULTIMATE"].includes(plan) ? plan : undefined,
    method: method === "email" || method === "google" ? method : undefined,
    verified: verified === "yes" || verified === "no" ? verified : undefined,
    status: isAccountStatus(status) ? status : undefined,
    agents: agents === "yes" || agents === "no" ? agents : undefined,
    group: (ACCOUNT_GROUPS as readonly string[]).includes(group ?? "") ? (group as AccountGroup) : undefined,
    createdBefore: isDay(one("createdBefore")),
    neverPaid: neverPaid === "yes" || neverPaid === "no" ? neverPaid : undefined,
    lastSignIn: lastSignIn === "never" || lastSignIn === "before" ? lastSignIn : undefined,
    signedInBefore: isDay(one("signedInBefore")),
    sort: (ACCOUNT_SORTS as readonly string[]).includes(sort ?? "") ? (sort as AccountSort) : undefined,
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
  };
}

/** The database filter for a group, the same split as signupTotals. */
function groupWhere(g: AccountGroup | undefined) {
  const notStaff = { isAdmin: false, accountStatus: { not: "STAFF" } };
  switch (g) {
    case "staff":
      return { OR: [{ isAdmin: true }, { accountStatus: "STAFF" }] };
    case "test":
      return { isAdmin: false, accountStatus: "TEST" };
    case "spam":
      return { isAdmin: false, accountStatus: { in: ["SPAM", "REVOKED"] } };
    case "performers":
      return { ...notStaff, kind: { not: "CASTING" }, accountStatus: { notIn: ["STAFF", "TEST", "SPAM", "REVOKED"] } };
    case "casting":
      return { ...notStaff, kind: "CASTING", accountStatus: { notIn: ["STAFF", "TEST", "SPAM", "REVOKED"] } };
    case "unreviewed":
      return { isAdmin: false, accountStatus: { notIn: ["STAFF", "TEST", "SPAM", "REVOKED", "APPROVED"] } };
    default:
      return {};
  }
}

/**
 * Every account matching the filters, newest first. Loaded whole (the list is
 * a few thousand rows at most) so plan, method and "Agents enabled", which are
 * computed, filter and page exactly like the stored columns.
 */
export async function listAccounts(f: AccountFilters = {}, take = 10000): Promise<AccountRow[]> {
  const q = f.q?.trim();
  const now = new Date();
  const mode = workflowMode();
  const access = await searchAccess();
  const users = await prisma.user.findMany({
    where: {
      AND: [
        // Round 9: deleted accounts live in Admin > Deleted only.
        { deletedAt: null },
        q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {},
        f.audience ? { kind: f.audience } : {},
        f.status ? { accountStatus: f.status } : {},
        groupWhere(f.group),
        f.createdBefore ? { createdAt: { lt: new Date(`${f.createdBefore}T00:00:00Z`) } } : {},
        f.lastSignIn === "never" ? { lastSignInAt: null } : {},
        f.lastSignIn === "before" && f.signedInBefore ? { lastSignInAt: { lt: new Date(`${f.signedInBefore}T00:00:00Z`) } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      email: true,
      kind: true,
      isAdmin: true,
      createdAt: true,
      lastSignInAt: true,
      ...ELIGIBILITY_SELECT,
      artistProfile: {
        select: { id: true, isMinor: true, ...COMPLETENESS_SELECT },
      },
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
      s.status !== "ACTIVE" ? "FREE" : s.plan === "FREE" && s.compPlan && s.compUntil && s.compUntil > now ? s.compPlan : s.plan,
    ])
  );
  const paid = await paidUserIds(users.map((u) => u.id));
  const rows: AccountRow[] = users.map((u) => {
    const facts = factsFrom(u, now);
    const isPaid = paid.has(u.id);
    return {
      id: u.id,
      name: u.artistProfile?.stageName || u.name || "",
      email: u.email,
      audience: u.kind,
      plan: u.kind === "TALENT" ? (planOf.get(u.id) ?? "FREE") : "",
      createdAt: u.createdAt,
      method: u.accounts.some((a) => a.provider === "google") ? "google" : u.passwordHash ? "email" : "other",
      emailVerified: facts.emailVerified !== null,
      verifiedAt: facts.emailVerified ?? null,
      status: isAccountStatus(u.accountStatus) ? u.accountStatus : "UNREVIEWED",
      isAdmin: u.isAdmin,
      agentsEnabled: u.kind === "TALENT" && agentsEnabled(facts, mode, access),
      completeness: u.artistProfile ? completenessOf(u.artistProfile) : null,
      mediaCount: u.artistProfile?._count.media ?? 0,
      website: u.sites.some((s) => s.status === "PUBLISHED") ? "published" : u.sites.length > 0 ? "draft" : "none",
      lastSignInAt: u.lastSignInAt,
      paid: isPaid,
      block: removalBlock({ isAdmin: u.isAdmin, accountStatus: u.accountStatus, deletedAt: null, paid: isPaid }),
    };
  });
  const kept = rows.filter(
    (r) =>
      (!f.plan || r.plan === f.plan) &&
      (!f.method || r.method === f.method) &&
      (!f.verified || r.emailVerified === (f.verified === "yes")) &&
      (!f.agents || r.agentsEnabled === (f.agents === "yes")) &&
      (!f.neverPaid || r.paid === (f.neverPaid === "no"))
  );
  return sortAccounts(kept, f.sort, f.dir);
}

/** Newest first by default; any column of ACCOUNT_SORTS either way. */
export function sortAccounts(rows: AccountRow[], sort: AccountSort | undefined, dir: "asc" | "desc" | undefined): AccountRow[] {
  if (!sort) return dir === "asc" ? [...rows].reverse() : rows;
  const key = (r: AccountRow): string | number => {
    switch (sort) {
      case "name":
        return r.name.toLowerCase();
      case "email":
        return r.email.toLowerCase();
      case "created":
        return r.createdAt.getTime();
      case "lastSignIn":
        return r.lastSignInAt?.getTime() ?? -1;
      case "status":
        return r.status;
      case "plan":
        return r.plan;
      case "completeness":
        return r.completeness ?? -1;
    }
  };
  const sign = (dir ?? (sort === "name" || sort === "email" ? "asc" : "desc")) === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -sign : x > y ? sign : 0;
  });
}

export interface SignupTotals {
  /** Unique registered accounts, every kind and status. */
  all: number;
  /** Real accounts (not staff, test or spam), by type and review state. */
  performers: { total: number; approved: number; unreviewed: number };
  casting: { total: number; approved: number; unreviewed: number };
  staff: number;
  test: number;
  spam: number;
}

/**
 * The signup counts. One row per User (email is unique), so an account is
 * counted once. Staff means status STAFF or an admin, whatever the status.
 * Limelight leads live in their own table and are never counted here.
 */
export async function signupTotals(): Promise<SignupTotals> {
  const groups = await prisma.user.groupBy({
    by: ["kind", "accountStatus", "isAdmin"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const t: SignupTotals = {
    all: 0,
    performers: { total: 0, approved: 0, unreviewed: 0 },
    casting: { total: 0, approved: 0, unreviewed: 0 },
    staff: 0,
    test: 0,
    spam: 0,
  };
  for (const g of groups) {
    const n = g._count._all;
    t.all += n;
    if (g.isAdmin || g.accountStatus === "STAFF") t.staff += n;
    else if (g.accountStatus === "TEST") t.test += n;
    // Spam and revoked eligibility: both excluded from the agents by staff.
    else if (g.accountStatus === "SPAM" || g.accountStatus === "REVOKED") t.spam += n;
    else {
      const side = g.kind === "CASTING" ? t.casting : t.performers;
      side.total += n;
      if (g.accountStatus === "APPROVED") side.approved += n;
      else side.unreviewed += n;
    }
  }
  return t;
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
      accountStatus: true,
      isAdmin: true,
      deletedAt: true,
      agentsOptInAt: true,
      autoSearchOptIn: true,
      artistProfile: { select: { id: true, ...COMPLETENESS_SELECT } },
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
  const head = ["id", "name", "email", "audience", "plan", "created_at", "signup", "email_verified", "status", "admin", "agents_enabled", "completeness", "media", "website", "last_sign_in", "paid"];
  const lines = rows.map((r) =>
    [r.id, r.name, r.email, r.audience, r.plan, r.createdAt, r.method, r.emailVerified, r.status, r.isAdmin, r.agentsEnabled, r.completeness ?? "", r.mediaCount, r.website, r.lastSignInAt ?? "", r.paid]
      .map(cell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
