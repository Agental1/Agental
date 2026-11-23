import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listDeleted, purgeDeletedAccounts, restoreAccount, softDeleteAccounts } from "@/lib/admin/account-removal";
import { listAccounts, signupTotals } from "@/lib/admin/accounts";
import { daysLeft, purgeDue, removalBlock } from "@/domain/account-removal";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const P = "test-r9-removal-";
const DAY = 24 * 60 * 60 * 1000;

describe("removal rule", () => {
  it("never lets staff, test, admin or paid accounts be selected", () => {
    const base = { isAdmin: false, accountStatus: "UNREVIEWED", paid: false, deletedAt: null };
    expect(removalBlock(base)).toBeNull();
    expect(removalBlock({ ...base, isAdmin: true })).toBe("admin");
    expect(removalBlock({ ...base, accountStatus: "STAFF" })).toBe("staff");
    expect(removalBlock({ ...base, accountStatus: "TEST" })).toBe("test");
    expect(removalBlock({ ...base, paid: true })).toBe("paid");
    expect(removalBlock({ ...base, accountStatus: "SPAM" })).toBeNull();
  });
  it("purges after 30 days, not before", () => {
    const at = new Date("2026-11-01T00:00:00Z");
    expect(purgeDue(at, new Date(at.getTime() + 29 * DAY))).toBe(false);
    expect(purgeDue(at, new Date(at.getTime() + 30 * DAY))).toBe(true);
    expect(daysLeft(at, at)).toBe(30);
  });
});

describe.skipIf(!local)("account removal", () => {
  const ids: Record<string, string> = {};
  let adminId: string;
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    adminId = (await prisma.user.create({ data: { email: `${P}admin@test.local`, isAdmin: true, accountStatus: "STAFF" } })).id;
    for (const [k, status] of [["junk", "UNREVIEWED"], ["spam", "SPAM"], ["test", "TEST"], ["staff", "STAFF"], ["paid", "UNREVIEWED"], ["old", "UNREVIEWED"]] as const) {
      ids[k] = (await prisma.user.create({ data: { email: `${P}${k}@test.local`, passwordHash: "x", accountStatus: status } })).id;
    }
    await prisma.subscription.create({ data: { subjectType: "ARTIST", subjectId: ids.paid, plan: "PRO", status: "ACTIVE" } });
  });
  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { subjectId: ids.paid } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: Object.values(ids) } } });
  });

  it("deletes only the unprotected ticked accounts, even if protected ids are posted", async () => {
    const res = await softDeleteAccounts(adminId, [ids.junk, ids.spam, ids.test, ids.staff, ids.paid, adminId]);
    expect(res).toEqual({ ok: true, done: 2, skipped: 4 });
    const junk = await prisma.user.findUnique({ where: { id: ids.junk } });
    expect(junk?.deletedAt).not.toBeNull();
    expect(junk?.accountStatus).toBe("REVOKED");
    expect(junk?.deletedPrevStatus).toBe("UNREVIEWED");
    expect((await prisma.user.findUnique({ where: { id: ids.test } }))?.deletedAt).toBeNull();
    expect((await prisma.user.findUnique({ where: { id: ids.paid } }))?.deletedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "admin.account.delete", resourceId: ids.junk } })).toBe(1);
  });

  it("hides deleted accounts from the lists and counts, and lists them in Deleted", async () => {
    const rows = await listAccounts({ q: P });
    expect(rows.map((r) => r.id)).not.toContain(ids.junk);
    expect(rows.find((r) => r.id === ids.test)?.block).toBe("test");
    expect(rows.find((r) => r.id === ids.paid)?.block).toBe("paid");
    const deleted = await listDeleted();
    expect(deleted.map((d) => d.id)).toEqual(expect.arrayContaining([ids.junk, ids.spam]));
    const totals = await signupTotals();
    expect(totals.all).toBe(await prisma.user.count({ where: { deletedAt: null } }));
  });

  it("keeps a deleted account away from the agents, even if its status is changed", async () => {
    const { agentEligibility } = await import("@/lib/agents");
    await prisma.user.update({ where: { id: ids.junk }, data: { accountStatus: "TEST" } });
    expect(await agentEligibility(ids.junk, { mode: "staging" })).toEqual({ ok: false, reason: "revoked" });
    await prisma.user.update({ where: { id: ids.junk }, data: { accountStatus: "REVOKED" } });
  });

  it("restores with the previous status", async () => {
    expect(await restoreAccount(adminId, ids.spam)).toBe(true);
    const spam = await prisma.user.findUnique({ where: { id: ids.spam } });
    expect(spam?.deletedAt).toBeNull();
    expect(spam?.accountStatus).toBe("SPAM");
    expect(await restoreAccount(adminId, ids.spam)).toBe(false);
  });

  it("purges only after 30 days", async () => {
    await softDeleteAccounts(adminId, [ids.old], new Date(Date.now() - 31 * DAY));
    const r = await purgeDeletedAccounts(new Date(), adminId);
    expect(r.purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.findUnique({ where: { id: ids.old } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: ids.junk } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "admin.account.purge", resourceId: ids.old } })).toBe(1);
    expect(await restoreAccount(adminId, ids.old)).toBe(false);
  });

  it("filters by group so each count opens its own list", async () => {
    const staff = await listAccounts({ q: P, group: "staff" });
    expect(staff.map((r) => r.id).sort()).toEqual([adminId, ids.staff].sort());
    const test = await listAccounts({ q: P, group: "test" });
    expect(test.map((r) => r.id)).toEqual([ids.test]);
    const neverPaid = await listAccounts({ q: P, neverPaid: "no" });
    expect(neverPaid.map((r) => r.id)).toEqual([ids.paid]);
  });
});
