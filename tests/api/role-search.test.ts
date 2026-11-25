import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";

/**
 * "Start finding roles" against the real database: the quota holds under
 * parallel clicks, a retried click stores one row, a failed search gives its
 * place back, and a performer reads only their own rows.
 */
const P = "test-rolesearch-";
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { startFindingRoles } = await import("@/app/actions/role-search");
const { getRoleSearchQuota, listMyRoleSearches, startRoleSearch } = await import("@/lib/role-search");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const key = (n: number) => `${P.replace(/-/g, "_")}${String(n).padStart(6, "0")}`;
let basic: string, revoked = "", bare = "";
let other: string;
let pro: string;
let unreviewed: string;
let unverified: string;
let approved: string;
let spam: string;
let minor: string;
let limited: string;

let savedAccess: { value: string; updatedById: string | null } | null = null;

describe.skipIf(!local)("AI role searches", () => {
  beforeAll(async () => {
    // These cases are the "Test accounts only" setting: pinned here, never read
    // from whatever the local database happens to hold (round 11.1).
    savedAccess = await prisma.appSetting.findUnique({ where: { key: "search.access" }, select: { value: true, updatedById: true } });
    const pinned = JSON.stringify({ access: "test_only" });
    await prisma.appSetting.upsert({ where: { key: "search.access" }, create: { key: "search.access", value: pinned }, update: { value: pinned } });
    // Verified, adult test accounts: the only kind staging lets through.
    const make = (name: string, over: Record<string, unknown> = {}) =>
      prisma.user.create({
        data: {
          email: `${P}${name}@test.local`,
          name,
          kind: "TALENT",
          emailVerified: new Date(),
          accountStatus: "TEST",
          artistProfile: { create: { stageName: name, birthDate: new Date("1990-01-01T00:00:00Z"), ...completeProfile(`${P}${name}`) } },
          ...over,
        },
      });
    basic = (await make("basic")).id;
    other = (await make("other")).id;
    pro = (await make("pro")).id;
    unreviewed = (await make("unreviewed", { accountStatus: "UNREVIEWED" })).id;
    unverified = (await make("unverified", { emailVerified: null, passwordHash: "x" })).id;
    approved = (await make("approved", { accountStatus: "APPROVED" })).id;
    spam = (await make("spam", { accountStatus: "SPAM" })).id;
    revoked = (await make("revoked", { accountStatus: "REVOKED" })).id;
    bare = (await make("bare", { artistProfile: { create: { stageName: "bare", birthDate: new Date("1990-01-01T00:00:00Z") } } })).id;
    minor = (await make("minor", {
      artistProfile: { create: { stageName: "minor", birthDate: new Date(Date.now() - 15 * 365 * 24 * 3600 * 1000), isMinor: true } },
    })).id;
    limited = (await make("limited")).id;
    await prisma.subscription.create({
      data: { subjectType: "ARTIST", subjectId: pro, plan: "PRO", status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    await prisma.appSetting.deleteMany({ where: { key: "search.access" } });
    if (savedAccess) await prisma.appSetting.create({ data: { key: "search.access", ...savedAccess } });
    const users = await prisma.user.findMany({ where: { email: { startsWith: P } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.subscription.deleteMany({ where: { subjectId: { in: ids } } });
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.map((id) => `role-search:start:${id}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } }); // rows cascade
  });

  it("refuses anyone who is not a signed-in performer", async () => {
    session.mockResolvedValue(null);
    expect(await startFindingRoles(key(1))).toMatchObject({ ok: false, error: { key: "errors.unauthorized" } });
    session.mockResolvedValue({ user: { id: basic, kind: "CASTING" } });
    expect(await startFindingRoles(key(1))).toMatchObject({ ok: false });
  });

  it("never goes over 5 on Basic, even with 10 parallel clicks", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => startRoleSearch(basic, key(100 + i)))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.reason === "quota_exhausted")).toHaveLength(5);
    expect(await prisma.roleSearchRequest.count({ where: { userId: basic } })).toBe(5);
    const rows = await prisma.roleSearchRequest.findMany({ where: { userId: basic } });
    expect(rows.every((r) => r.status === "queued" && r.plan === "FREE" && /^p\d+$/.test(r.periodKey))).toBe(true);
    expect((await getRoleSearchQuota(basic)).remaining).toBe(0);
  });

  it("spaces a performer's searches 6 hours apart (round 8b)", async () => {
    const rows = await prisma.roleSearchRequest.findMany({ where: { userId: basic }, orderBy: { scheduledFor: "asc" } });
    expect(rows).toHaveLength(5);
    const gaps = rows.slice(1).map((r, i) => r.scheduledFor!.getTime() - rows[i].scheduledFor!.getTime());
    expect(gaps.every((g) => g === 6 * 60 * 60 * 1000)).toBe(true);
    // The first one may start at once.
    expect(rows[0].scheduledFor!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("refuses the 21st press of the button within an hour (round 8c)", async () => {
    session.mockResolvedValue({ user: { id: limited, kind: "TALENT" } });
    for (let i = 0; i < 20; i++) {
      const r = await startFindingRoles(key(300 + i));
      expect(r.ok || r.error.key !== "errors.tooManyAttempts").toBe(true);
    }
    expect(await startFindingRoles(key(320))).toMatchObject({ ok: false, error: { key: "errors.tooManyAttempts" } });
  });

  it("stores one row for a retried click", async () => {
    session.mockResolvedValue({ user: { id: other, kind: "TALENT" } });
    const a = await startFindingRoles(key(200));
    const b = await startFindingRoles(key(200));
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    expect(await prisma.roleSearchRequest.count({ where: { userId: other } })).toBe(1);
  });

  it("gives a failed search's place back", async () => {
    const before = await getRoleSearchQuota(other);
    await prisma.roleSearchRequest.updateMany({ where: { userId: other }, data: { status: "failed" } });
    expect((await getRoleSearchQuota(other)).remaining).toBe(before.remaining + 1);
    const again = await startRoleSearch(other, key(201));
    expect(again.ok).toBe(true);
  });

  it("answers the quota error key at zero", async () => {
    session.mockResolvedValue({ user: { id: basic, kind: "TALENT" } });
    expect(await startFindingRoles(key(300))).toMatchObject({
      ok: false,
      error: { key: "errors.roleSearchQuota" },
      quota: { remaining: 0 },
    });
  });

  it("starts the period at the first search and keeps it", async () => {
    const before = await getRoleSearchQuota(pro);
    expect(before).toMatchObject({ limit: 50, used: 0, resetsAt: null });
    const res = await startRoleSearch(pro, key(400));
    expect(res.ok && res.quota.limit === 50 && res.quota.resetInDays === 30).toBe(true);
    const row = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: pro } });
    expect(row.plan).toBe("PRO");
    expect(row.periodKey).toMatch(/^p\d+$/);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: pro } });
    expect(u.searchPeriodStartedAt).not.toBeNull();
    await startRoleSearch(pro, key(401));
    const again = await prisma.user.findUniqueOrThrow({ where: { id: pro } });
    expect(again.searchPeriodStartedAt?.getTime()).toBe(u.searchPeriodStartedAt?.getTime());
    // Round 11.1: queued searches hold their place but use nothing until they start.
    expect(await getRoleSearchQuota(pro)).toMatchObject({ used: 0, held: 2, remaining: 48 });
  });

  it("resets after 30 days and the next search opens a new period", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: pro }, data: { searchPeriodStartedAt: old } });
    // Round 11.1: the two searches still queued used nothing, and still hold their place.
    expect(await getRoleSearchQuota(pro)).toMatchObject({ used: 0, held: 2, remaining: 48, resetsAt: null });
    const res = await startRoleSearch(pro, key(402));
    expect(res.ok && res.quota.used === 0 && res.quota.held === 3).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: pro } });
    expect(u.searchPeriodStartedAt!.getTime()).toBeGreaterThan(old.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  it("queues nothing for an account that may not trigger agents", async () => {
    const cases: [string, string][] = [
      [unreviewed, "errors.agentsUnavailable"], // a real account (automatic) never runs in staging
      [unverified, "errors.agentsEmailUnverified"],
      [approved, "errors.agentsUnavailable"], // a real account never runs in staging
      [spam, "errors.agentsUnavailable"],
      [minor, "errors.agentsUnavailable"],
      [revoked, "errors.agentsUnavailable"],
      [bare, "errors.agentsProfileIncomplete"], // verified test account, profile not at 100%
    ];
    for (const [id, errorKey] of cases) {
      session.mockResolvedValue({ user: { id, kind: "TALENT" } });
      expect(await startFindingRoles(key(500))).toMatchObject({ ok: false, error: { key: errorKey } });
      expect(await prisma.roleSearchRequest.count({ where: { userId: id } })).toBe(0);
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(u.agentsOptInAt).toBeNull();
      expect(u.searchPeriodStartedAt).toBeNull();
    }
  });

  it("lets an approved account through in live, never a test account", async () => {
    const live = await startRoleSearch(approved, key(600), new Date(), "live");
    expect(live.ok).toBe(true);
    // Automatic eligibility: a verified, complete real account needs no approval.
    expect((await startRoleSearch(unreviewed, key(602), new Date(), "live")).ok).toBe(true);
    const test = await startRoleSearch(pro, key(601), new Date(), "live");
    expect(test).toMatchObject({ ok: false, reason: "ineligible", why: "test_account" });
  });

  it("stamps the opt-in on the first accepted click only", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: other } });
    expect(u.agentsOptInAt).not.toBeNull();
    await startRoleSearch(other, key(700));
    const again = await prisma.user.findUniqueOrThrow({ where: { id: other } });
    expect(again.agentsOptInAt?.getTime()).toBe(u.agentsOptInAt?.getTime());
  });

  it("refuses a retried click once the account is no longer eligible", async () => {
    session.mockResolvedValue({ user: { id: other, kind: "TALENT" } });
    const first = await startFindingRoles(key(800));
    expect(first.ok).toBe(true);
    await prisma.user.update({ where: { id: other }, data: { accountStatus: "SPAM" } });
    expect(await startFindingRoles(key(800))).toMatchObject({ ok: false, error: { key: "errors.agentsUnavailable" } });
    await prisma.user.update({ where: { id: other }, data: { accountStatus: "TEST" } });
  });

  it("lists only the performer's own rows", async () => {
    const mine = await listMyRoleSearches(other);
    const owners = await prisma.roleSearchRequest.findMany({
      where: { id: { in: mine.map((r) => r.id) } },
      select: { userId: true },
    });
    expect(owners.every((o) => o.userId === other)).toBe(true);
  });
});
