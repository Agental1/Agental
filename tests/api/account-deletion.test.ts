import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { confirmationPhrase, deletionDays, deletionEligible } from "@/domain/account-deletion";

/**
 * Account cleanup (round 7b, 3.3): only never-verified, old enough, never paid,
 * non-staff, non-test accounts are listed; nothing goes without the typed
 * phrase for the exact count; each deletion leaves an audit entry without the
 * email address.
 */
vi.mock("@/lib/mailer", () => ({ sendEmail: vi.fn(async () => ({ ok: true, mode: "log" })), emailSenderConfigured: () => false }));
const P = "test-deletion-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const { listDeletionCandidates, deleteEligibleAccounts, sendDeletionWarnings } = await import("@/lib/admin/account-deletion");

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const old = new Date(now.getTime() - 10 * DAY);

describe("deletion rule", () => {
  const base = { verifiedAt: null, createdAt: old, paid: false, accountStatus: "UNREVIEWED", isAdmin: false };
  it("takes only old, unverified, unpaid, ordinary accounts", () => {
    expect(deletionEligible(base, now, 7)).toBe(true);
    expect(deletionEligible({ ...base, createdAt: new Date(now.getTime() - 3 * DAY) }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, verifiedAt: new Date(0) }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, paid: true }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "TEST" }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "STAFF" }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, isAdmin: true }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "SPAM" }, now, 7)).toBe(true);
  });
  it("reads the number of days safely", () => {
    expect(deletionDays(undefined)).toBe(7);
    expect(deletionDays("30")).toBe(30);
    expect(deletionDays("0")).toBe(7);
    expect(deletionDays("abc")).toBe(7);
    expect(confirmationPhrase(3)).toBe("DELETE 3");
  });
});

describe.skipIf(!local)("account cleanup on the database", () => {
  const ids: Record<string, string> = {};
  let admin = "";
  beforeAll(async () => {
    const make = async (name: string, data: Record<string, unknown>) =>
      (ids[name] = (
        await prisma.user.create({ data: { email: `${P}${name}@test.local`, kind: "TALENT", passwordHash: "x", createdAt: old, ...data } })
      ).id);
    admin = (await prisma.user.create({ data: { email: `${P}admin@test.local`, isAdmin: true, emailVerified: now } })).id;
    await make("fake", { artistProfile: { create: { stageName: "fake", media: { create: [{ type: "PHOTO", storageKey: `${P}fake/photo` }] } } } });
    await make("recent", { createdAt: now });
    await make("verified", { emailVerified: now });
    await make("google", { passwordHash: null, accounts: { create: [{ type: "oauth", provider: "google", providerAccountId: `${P}g` }] } });
    await make("paid", {});
    await prisma.siteOrder.create({ data: { userId: ids.paid, offer: "essential", amountCents: 9900, status: "PAID", paidAt: now } });
    await make("test", { accountStatus: "TEST" });
  });
  afterAll(async () => {
    await prisma.siteOrder.deleteMany({ where: { userId: ids.paid } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    await prisma.auditLog.deleteMany({ where: { resourceId: ids.fake } });
  });

  const mine = async () => (await listDeletionCandidates(7, now)).filter((r) => r.email.startsWith(P)).map((r) => r.email);

  it("lists only the fake account", async () => {
    expect(await mine()).toEqual([`${P}fake@test.local`]);
  });

  it("marks a warned account once", async () => {
    await sendDeletionWarnings(admin, 7, "http://localhost:3200", now);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.fake } });
    expect(u.deletionWarnedAt).not.toBeNull();
  });

  it("deletes nothing without the exact phrase, then deletes with an audit entry", async () => {
    const count = (await listDeletionCandidates(7, now)).length;
    expect(await deleteEligibleAccounts(admin, 7, "DELETE", now)).toEqual({ ok: false, reason: "confirmation" });
    expect(await prisma.user.count({ where: { id: ids.fake } })).toBe(1);
    // Only run on a local database with nothing but test rows on the list.
    const all = await listDeletionCandidates(7, now);
    expect(all.every((r) => r.email.startsWith(P) || !r.email.includes("@agental"))).toBe(true);
    if (all.some((r) => !r.email.startsWith(P))) return; // never delete local demo data here
    const res = await deleteEligibleAccounts(admin, 7, confirmationPhrase(count), now);
    expect(res).toEqual({ ok: true, deleted: 1, failed: 0 });
    expect(await prisma.user.count({ where: { id: ids.fake } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.account.delete", resourceId: ids.fake } });
    expect(log.before).not.toContain("@");
    expect(await prisma.user.count({ where: { id: { in: [ids.recent, ids.verified, ids.google, ids.paid, ids.test] } } })).toBe(5);
  });
});
