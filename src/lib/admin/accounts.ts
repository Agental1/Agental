import { PRIVACY_POLICY_VERSION } from "@/domain/legal-versions";
import { prisma } from "@/lib/db";
import { zonedDayStart } from "@/lib/format";
import { auditLabel } from "@/domain/audit-labels";
import { COMPLETENESS_SELECT, completenessOf } from "@/lib/completeness";
import { ELIGIBILITY_SELECT, factsFrom } from "@/lib/agents";
import { agentsEnabled, isAccountStatus, workflowMode, type AccountStatus } from "@/domain/workflow/eligibility";
import { searchAccess } from "@/lib/app-settings";
import { removalBlock, type RemovalBlock } from "@/domain/account-removal";
import { accountType, effectiveStatus, isTestAccount, type AccountType } from "@/domain/account-model";
import { searchBlock, type SearchBlock } from "@/domain/search-block";
import { completenessInputOf, missingItems } from "@/domain/completeness";
import { COUNTED_STATUSES, allowanceFor, periodActive } from "@/domain/role-search";
import { consentChoiceOf, type ConsentChoice } from "@/domain/consent-choice";
import { isAdult } from "@/domain/age";
import type { PlanB2C } from "@/domain/enums";
import { paidUserIds } from "@/lib/admin/account-removal";
import { effectivePlan } from "@/lib/billing/entitlement";

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
  /** Created before this day (YYYY-MM-DD, admin time zone: Los Angeles). */
  createdBefore?: string;
  /** yes: never paid and in no organization; no: paid or in one. */
  neverPaid?: "yes" | "no";
  /** never: no sign-in recorded (recorded since round 9); before: last sign-in before signedInBefore. */
  lastSignIn?: "never" | "before";
  signedInBefore?: string;
  /** Round 11: the Privacy Policy accepted (any version) or not. */
  privacy?: "yes" | "no";
  sort?: AccountSort;
  dir?: "asc" | "desc";
}

/** Round 10: the groups are the types, the Test flag and "blocked by staff". */
export const ACCOUNT_GROUPS = ["performers", "casting", "staff", "test", "blocked"] as const;
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
  /** Round 10: Performer, Casting or Staff, and the separate Test flag. */
  type: AccountType;
  isTest: boolean;
  /** Round 10: null = "Can search: Yes"; "n/a" for Casting and Staff not marked Test. */
  canSearch: SearchBlock | null | "n/a";
  /** Searches counted this 30-day period (since the last quota reset). */
  searchesUsed: number;
  /** Round 10: the cookie choice recorded on the account. */
  consent: { choice: ConsentChoice; at: Date | null; version: string | null };
  /** Round 11: the Privacy Policy accepted on the account, when and which version. */
  privacy: { at: Date | null; version: string | null };
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
  const privacy = one("privacy");
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
    privacy: privacy === "yes" || privacy === "no" ? privacy : undefined,
    sort: (ACCOUNT_SORTS as readonly string[]).includes(sort ?? "") ? (sort as AccountSort) : undefined,
    dir: dir === "asc" || dir === "desc" ? dir : undefined,
  };
}

/** The database filter for a group (round 10 model, see src/domain/account-model.ts). */
const STAFF_WHERE = { OR: [{ isStaff: true }, { isAdmin: true }, { accountStatus: "STAFF" }] };
const NOT_STAFF = { isStaff: false, isAdmin: false, accountStatus: { not: "STAFF" } };
function groupWhere(g: AccountGroup | undefined) {
  switch (g) {
    case "staff":
      return STAFF_WHERE;
    case "test":
      return { accountStatus: "TEST" };
    case "blocked":
      return { accountStatus: { in: ["SPAM", "REVOKED"] } };
    case "performers":
      return { ...NOT_STAFF, kind: { not: "CASTING" } };
    case "casting":
      return { ...NOT_STAFF, kind: "CASTING" };
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
        f.createdBefore ? { createdAt: { lt: zonedDayStart(f.createdBefore) } } : {},
        f.lastSignIn === "never" ? { lastSignInAt: null } : {},
        f.privacy === "yes" ? { privacyAcceptedAt: { not: null }, privacyVersion: PRIVACY_POLICY_VERSION } : f.privacy === "no" ? { OR: [{ privacyAcceptedAt: null }, { privacyVersion: { not: PRIVACY_POLICY_VERSION } }, { privacyVersion: null }] } : {},
        f.lastSignIn === "before" && f.signedInBefore ? { lastSignInAt: { lt: zonedDayStart(f.signedInBefore) } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      lastSignInAt: true,
      searchPeriodStartedAt: true,
      searchQuotaResetAt: true,
      consentAnalytics: true,
      consentMarketing: true,
      consentAt: true,
      consentVersion: true,
      privacyAcceptedAt: true,
      privacyVersion: true,
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
  // Round 10: the same plan the performer's quota uses (a comp plan included).
  const planOf = new Map(subs.map((s) => [s.subjectId, effectivePlan(s, now).plan]));
  const paid = await paidUserIds(users.map((u) => u.id));
  // Searches held now, in one query (same rule as heldSearches, round 11.1):
  // queued and running ones, plus the ones started this period.
  const counted = await prisma.roleSearchRequest.findMany({
    where: { userId: { in: users.map((u) => u.id) }, status: { in: [...COUNTED_STATUSES] } },
    select: { userId: true, status: true, startedAt: true, createdAt: true },
  });
  const usedOf = (u: { id: string; searchPeriodStartedAt: Date | null; searchQuotaResetAt: Date | null }) => {
    const start = u.searchPeriodStartedAt;
    const active = periodActive(start, now);
    return counted.filter(
      (r) =>
        r.userId === u.id &&
        (!u.searchQuotaResetAt || r.createdAt >= u.searchQuotaResetAt) &&
        (r.status !== "done" || (active && (r.startedAt ?? r.createdAt) >= start!))
    ).length;
  };
  const rows: AccountRow[] = users.map((u) => {
    const facts = factsFrom(u, now);
    const isPaid = paid.has(u.id);
    const type = accountType(u);
    const plan = (u.kind === "TALENT" ? (planOf.get(u.id) ?? "FREE") : "FREE") as PlanB2C;
    const used = usedOf(u);
    const limit = allowanceFor(plan).count;
    const p = u.artistProfile;
    const canSearch: AccountRow["canSearch"] =
      u.kind !== "TALENT" || (type === "STAFF" && !isTestAccount(u))
        ? "n/a"
        : searchBlock({
            kind: u.kind,
            accountStatus: effectiveStatus(u),
            deleted: false,
            isAdult: !!p && !p.isMinor && isAdult(p.birthDate, now),
            emailVerified: facts.emailVerified !== null,
            missing: p ? missingItems(completenessInputOf(p)) : ["legalName"],
            quota: { limit, remaining: Math.max(0, limit - used), resetsAt: null },
            mode,
            access,
          });
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
      block: removalBlock({ isAdmin: u.isAdmin || u.isStaff, accountStatus: effectiveStatus(u), deletedAt: null, paid: isPaid }),
      type,
      isTest: isTestAccount(u),
      canSearch,
      searchesUsed: used,
      consent: { choice: consentChoiceOf(u), at: u.consentAt, version: u.consentVersion },
      privacy: { at: u.privacyAcceptedAt, version: u.privacyVersion },
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

/**
 * Round 10: the one set of counts every admin page shows (definitions in
 * docs/DECISIONS.md). Accounts in the 30-day "Deleted" list are counted only
 * as "deleted". Test accounts are counted in their type and in "test".
 */
export interface AccountCounts {
  /** Everyone who signed up and is not deleted. */
  accounts: number;
  performers: number;
  casting: number;
  staff: number;
  /** Accounts with the Test flag, whatever their type. */
  test: number;
  /** In Admin > Deleted (restorable for 30 days, then purged). */
  deleted: number;
}

export async function accountCounts(): Promise<AccountCounts> {
  const groups = await prisma.user.groupBy({
    by: ["kind", "accountStatus", "isAdmin", "isStaff"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const deleted = await prisma.user.count({ where: { deletedAt: { not: null } } });
  const c: AccountCounts = { accounts: 0, performers: 0, casting: 0, staff: 0, test: 0, deleted };
  for (const g of groups) {
    const n = g._count._all;
    c.accounts += n;
    const type = accountType(g);
    if (type === "STAFF") c.staff += n;
    else if (type === "CASTING") c.casting += n;
    else c.performers += n;
    if (isTestAccount(g)) c.test += n;
  }
  return c;
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
      isStaff: true,
      deletedAt: true,
      agentsOptInAt: true,
      autoSearchOptIn: true,
      // Round 11: the cookie choice and the Privacy Policy, side by side on the page.
      consentAnalytics: true,
      consentMarketing: true,
      consentAt: true,
      consentVersion: true,
      privacyAcceptedAt: true,
      privacyVersion: true,
      representationAckAt: true,
      representationAckVersion: true,
      plansStepAt: true,
      plansStepVersion: true,
      plansStepChoice: true,
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
  for (const a of audits) if (a.action !== "user.signup") events.push({ at: a.createdAt, kind: "audit", detail: auditLabel(a.action) });
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
  const head = ["id", "name", "email", "type", "test", "email_verified", "verified_at", "completeness", "can_search", "searches_used", "created_at", "last_sign_in", "plan", "signup", "cookies", "cookies_at", "cookies_version", "privacy_accepted_at", "privacy_version", "media", "website", "paid", "admin"];
  const lines = rows.map((r) =>
    [r.id, r.name, r.email, r.type, r.isTest, r.emailVerified, r.verifiedAt && r.verifiedAt.getTime() > 0 ? r.verifiedAt : "", r.completeness ?? "", canSearchCsv(r.canSearch), r.searchesUsed, r.createdAt, r.lastSignInAt ?? "", r.plan, r.method, r.consent.choice, r.consent.at ?? "", r.consent.version ?? "", r.privacy.at ?? "", r.privacy.version ?? "", r.mediaCount, r.website, r.paid, r.isAdmin]
      .map(cell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/** Round 11: the CSV says it in words, the same as the table (English, like the other columns). */
const CAN_SEARCH_CSV: Record<SearchBlock["reason"], string> = {
  blocked: "no: blocked by staff",
  not_adult: "no: under 18",
  email_unverified: "no: email not verified",
  profile_incomplete: "no: profile below 100%",
  not_open: "no: searches not open for this account (test mode)",
  quota: "no: no searches left this month",
};
export function canSearchCsv(value: AccountRow["canSearch"]): string {
  if (value === null) return "yes";
  if (value === "n/a") return "not a performer";
  return CAN_SEARCH_CSV[value.reason];
}
