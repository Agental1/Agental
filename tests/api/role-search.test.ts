import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

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
let basic: string;
let other: string;
let pro: string;

describe.skipIf(!local)("AI role searches", () => {
  beforeAll(async () => {
    const make = (name: string) =>
      prisma.user.create({ data: { email: `${P}${name}@test.local`, name, kind: "TALENT" } });
    basic = (await make("basic")).id;
    other = (await make("other")).id;
    pro = (await make("pro")).id;
    await prisma.subscription.create({
      data: { subjectType: "ARTIST", subjectId: pro, plan: "PRO", status: "ACTIVE" },
    });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { startsWith: P } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.subscription.deleteMany({ where: { subjectId: { in: ids } } });
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
    expect((await getRoleSearchQuota(pro)).used).toBe(2);
  });

  it("resets after 30 days and the next search opens a new period", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await prisma.user.update({ where: { id: pro }, data: { searchPeriodStartedAt: old } });
    expect(await getRoleSearchQuota(pro)).toMatchObject({ used: 0, remaining: 50, resetsAt: null });
    const res = await startRoleSearch(pro, key(402));
    expect(res.ok && res.quota.used === 1).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: pro } });
    expect(u.searchPeriodStartedAt!.getTime()).toBeGreaterThan(old.getTime() + 30 * 24 * 60 * 60 * 1000);
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
