import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { confirmationPhrase, deletionDays, deletionEligible, listFingerprint } from "@/domain/account-deletion";

/**
 * Account cleanup (round 7b, 3.3): only never-verified, old enough, never paid,
 * non-staff, non-test accounts are listed; nothing goes without the typed
 * phrase for the exact count; each deletion leaves an audit entry without the
 * email address.
 */
const sendEmail = vi.fn(async () => ({ ok: true, mode: "resend" }));
vi.mock("@/lib/mailer", () => ({ sendEmail, emailSenderConfigured: () => true }));
const P = "test-deletion-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const { listDeletionCandidates, deleteEligibleAccounts, sendDeletionWarnings, deletionCsv } = await import("@/lib/admin/account-deletion");

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const old = new Date(now.getTime() - 10 * DAY);

describe("deletion rule", () => {
  const base = { verifiedAt: null, createdAt: old, paid: false, accountStatus: "UNREVIEWED", isAdmin: false, warnedAt: null };
  it("takes only old, unverified, unpaid, ordinary accounts", () => {
    expect(deletionEligible(base, now, 7)).toBe(true);
    expect(deletionEligible({ ...base, createdAt: new Date(now.getTime() - 3 * DAY) }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, verifiedAt: new Date(0) }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, paid: true }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "TEST" }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "STAFF" }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, isAdmin: true }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "APPROVED" }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, accountStatus: "SPAM" }, now, 7)).toBe(true);
    // A warning promises N days.
    expect(deletionEligible({ ...base, warnedAt: new Date(now.getTime() - DAY) }, now, 7)).toBe(false);
    expect(deletionEligible({ ...base, warnedAt: old }, now, 7)).toBe(true);
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

  const scope = { emailPrefix: P };
  const mine = async () => (await listDeletionCandidates(7, now, scope)).map((r) => r.email);

  it("lists only the fake account", async () => {
    expect(await mine()).toEqual([`${P}fake@test.local`]);
  });

  it("warns once, and a failed send leaves the account unwarned", async () => {
    sendEmail.mockResolvedValueOnce({ ok: false } as never);
    expect(await sendDeletionWarnings(admin, 7, "http://localhost:3200", now, scope)).toMatchObject({ ok: true, sent: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.fake } })).deletionWarnedAt).toBeNull();
    expect(await sendDeletionWarnings(admin, 7, "http://localhost:3200", now, scope)).toMatchObject({ ok: true, sent: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.fake } })).deletionWarnedAt).not.toBeNull();
    // Warned just now: kept for the N days the email promised.
    expect(await mine()).toEqual([]);
    expect(await sendDeletionWarnings(admin, 7, "http://localhost:3200", now, scope)).toMatchObject({ ok: true, sent: 0 });
  });

  it("deletes nothing without the exact phrase and list, then deletes with an audit entry", async () => {
    // The warning window has passed.
    await prisma.user.update({ where: { id: ids.fake }, data: { deletionWarnedAt: old } });
    const rows = await listDeletionCandidates(7, now, scope);
    const print = listFingerprint(rows.map((r) => r.id), 7);
    expect(await deleteEligibleAccounts(admin, 7, "DELETE", print, now, scope)).toEqual({ ok: false, reason: "confirmation" });
    expect(await deleteEligibleAccounts(admin, 7, confirmationPhrase(rows.length), "stale", now, scope)).toEqual({ ok: false, reason: "changed" });
    expect(await prisma.user.count({ where: { id: ids.fake } })).toBe(1);
    const res = await deleteEligibleAccounts(admin, 7, confirmationPhrase(rows.length), print, now, scope);
    expect(res).toEqual({ ok: true, deleted: 1, failed: 0, remaining: 0 });
    expect(await prisma.user.count({ where: { id: ids.fake } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "admin.account.delete", resourceId: ids.fake } });
    expect(log.before).not.toContain("@");
    expect(await prisma.user.count({ where: { id: { in: [ids.recent, ids.verified, ids.google, ids.paid, ids.test] } } })).toBe(5);
    expect(await deleteEligibleAccounts(admin, 7, "DELETE 0", print, now, scope)).toEqual({ ok: false, reason: "empty" });
  });

  it("escapes spreadsheet formulas in the CSV", () => {
    const csv = deletionCsv([{ id: "1", email: "=HYPERLINK(1)@x.com", kind: "TALENT", createdAt: old, accountStatus: "UNREVIEWED", warnedAt: null, mediaCount: 0 }]);
    expect(csv).toContain("'=HYPERLINK(1)@x.com");
  });
});

describe.skipIf(!local)("account cleanup: deleting only the ticked accounts (round 8c)", () => {
  const Q = "test-deletion-pick-";
  const ids: Record<string, string> = {};
  let admin = "";
  const scope = { emailPrefix: Q };
  beforeAll(async () => {
    admin = (await prisma.user.create({ data: { email: `${Q}admin@test.local`, isAdmin: true, emailVerified: now } })).id;
    for (const name of ["a", "b", "c"])
      ids[name] = (await prisma.user.create({ data: { email: `${Q}${name}@test.local`, kind: "TALENT", passwordHash: "x", createdAt: old } })).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: Object.values(ids) } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: Q } } });
  });

  it("deletes the ticked accounts only, counts them in the phrase, and refuses an id off the list", async () => {
    const rows = await listDeletionCandidates(7, now, scope);
    expect(rows).toHaveLength(3);
    const print = listFingerprint(rows.map((r) => r.id), 7);
    // Nothing ticked deletes nothing (never "everything").
    expect(await deleteEligibleAccounts(admin, 7, "DELETE 3", print, now, scope, [])).toEqual({ ok: false, reason: "none_selected" });
    // The phrase counts the ticked accounts, not the whole list.
    expect(await deleteEligibleAccounts(admin, 7, "DELETE 3", print, now, scope, [ids.a, ids.b])).toEqual({ ok: false, reason: "confirmation" });
    // An id that is not on the eligible list refuses the whole run.
    expect(await deleteEligibleAccounts(admin, 7, "DELETE 2", print, now, scope, [ids.a, admin])).toEqual({ ok: false, reason: "changed" });
    expect(await prisma.user.count({ where: { id: { in: [ids.a, ids.b, ids.c] } } })).toBe(3);
    expect(await deleteEligibleAccounts(admin, 7, "DELETE 2", print, now, scope, [ids.a, ids.b])).toEqual({
      ok: true,
      deleted: 2,
      failed: 0,
      remaining: 0,
    });
    expect(await prisma.user.count({ where: { id: ids.c } })).toBe(1);
    expect(await prisma.user.count({ where: { id: { in: [ids.a, ids.b] } } })).toBe(0);
  });
});
