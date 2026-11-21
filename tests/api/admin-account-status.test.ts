import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

/**
 * Account review status (round 7, Part A1): only an admin, checked against the
 * database, can change it; every real change leaves one audit entry with the
 * before and after; the totals count each account once and keep staff, test
 * and spam apart; "Agents enabled" follows the status, the email and the opt-in.
 */
const P = "test-acctstatus-";
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));

const { setAccountStatus } = await import("@/app/actions/admin-accounts");
const { listAccounts, signupTotals } = await import("@/lib/admin/accounts");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
let admin: string;
let plain: string;
let a: string;
let b: string;
let c: string;

describe.skipIf(!local)("account review status", () => {
  beforeAll(async () => {
    const make = (name: string, over: Record<string, unknown> = {}) =>
      prisma.user.create({ data: { email: `${P}${name}@test.local`, name, kind: "TALENT", ...over } }).then((u) => u.id);
    admin = await make("admin", { isAdmin: true });
    plain = await make("plain");
    const adult = { create: { stageName: "x", birthDate: new Date("1990-01-01T00:00:00Z") } };
    a = await make("a", { emailVerified: new Date(), artistProfile: adult, agentsOptInAt: new Date() });
    b = await make("b", { emailVerified: new Date(), artistProfile: adult });
    c = await make("c", { kind: "CASTING" });
  });

  afterAll(async () => {
    const ids = [admin, plain, a, b, c].filter(Boolean);
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: ids }, action: "admin.account.status" } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("starts every new account unreviewed", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: b } });
    expect(u.accountStatus).toBe("UNREVIEWED");
  });

  it("refuses anyone who is not an admin", async () => {
    session.mockResolvedValue(null);
    expect(await setAccountStatus([a], "APPROVED")).toEqual({ ok: false, reason: "forbidden" });
    session.mockResolvedValue({ user: { id: plain, kind: "TALENT" } });
    expect(await setAccountStatus([a], "APPROVED")).toEqual({ ok: false, reason: "forbidden" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a } })).accountStatus).toBe("UNREVIEWED");
  });

  it("refuses an unknown status or a bad id list", async () => {
    session.mockResolvedValue({ user: { id: admin } });
    expect(await setAccountStatus([a], "ELIGIBLE" as never)).toEqual({ ok: false, reason: "invalid" });
    expect(await setAccountStatus([], "TEST")).toEqual({ ok: false, reason: "invalid" });
    expect(await setAccountStatus(["bad id;"], "TEST")).toEqual({ ok: false, reason: "invalid" });
    expect(await setAccountStatus(Array.from({ length: 501 }, (_, i) => `id${i}`), "TEST")).toEqual({ ok: false, reason: "invalid" });
  });

  it("changes many at once, with one audit entry per changed account", async () => {
    session.mockResolvedValue({ user: { id: admin } });
    expect(await setAccountStatus([a, b, b], "TEST")).toEqual({ ok: true, changed: 2 });
    const logs = await prisma.auditLog.findMany({ where: { action: "admin.account.status", resourceId: { in: [a, b] } } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.actorUserId === admin)).toBe(true);
    expect(JSON.parse(logs[0].before)).toEqual({ accountStatus: "UNREVIEWED" });
    expect(JSON.parse(logs[0].after)).toMatchObject({ accountStatus: "TEST", bulk: true });
    // Setting the same status again changes nothing and logs nothing.
    expect(await setAccountStatus([a], "TEST")).toEqual({ ok: true, changed: 0 });
    expect(await prisma.auditLog.count({ where: { action: "admin.account.status", resourceId: a } })).toBe(1);
  });

  it("shows Agents enabled only with the status, a verified adult and the opt-in", async () => {
    // Staging (no WORKFLOW_MODE): TEST accounts only.
    const rows = await listAccounts({ q: P });
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get(a)?.agentsEnabled).toBe(true); // TEST, verified, adult, opted in
    expect(by.get(b)?.agentsEnabled).toBe(false); // never clicked
    expect(by.get(plain)?.agentsEnabled).toBe(false);
    expect((await listAccounts({ q: P, agents: "yes" })).map((r) => r.id)).toEqual([a]);
    expect((await listAccounts({ q: P, status: "TEST" })).map((r) => r.id).sort()).toEqual([a, b].sort());
  });

  it("counts each account once, with staff, test and spam apart", async () => {
    const before = await signupTotals();
    session.mockResolvedValue({ user: { id: admin } });
    await setAccountStatus([plain], "SPAM");
    await setAccountStatus([c], "APPROVED");
    const after = await signupTotals();
    expect(after.all).toBe(before.all);
    expect(after.spam).toBe(before.spam + 1);
    expect(after.performers.total).toBe(before.performers.total - 1);
    expect(after.casting.approved).toBe(before.casting.approved + 1);
    expect(after.casting.unreviewed).toBe(before.casting.unreviewed - 1);
    // An admin counts as staff whatever the status.
    await setAccountStatus([admin], "APPROVED");
    const again = await signupTotals();
    expect(again.staff).toBe(after.staff);
    expect(again.performers.approved).toBe(after.performers.approved);
  });
});
