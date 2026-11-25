import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { accountCounts } from "@/lib/admin/accounts";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const SQL = readFileSync(path.join(__dirname, "../../prisma/migrations/20261229000000_round111_two_test_accounts/migration.sql"), "utf8");
const statements = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
const run = async () => { for (const s of statements) await prisma.$executeRawUnsafe(s); };

const IDS = ["cmth9cid50000rllhay64f066", "cmth9citg0005rllhjaf2m33i", "cmth9cj7k000brllh18qpkopb", "cmth9cjlq000grllhp935bwgk", "cmth9ck2y000mrllhw38md1fe", "cmth9ckj10012rllhmqo7zg44"];
const TALENT = "contact+talent@agental.co";
const CASTING = "contact+casting@agental.co";
const OTHER = "test-r111-other@demo.agental.co"; // demo address, not in the list
const OTHER_ID = "r111testother0001";

describe.skipIf(!local)("round 11.1 group 2 migration", () => {
  let createdAdmin = false;
  let preexisting: string[] = [];
  const cleanup = async () => {
    const ids = [...IDS, OTHER_ID];
    await prisma.auditLog.deleteMany({ where: { resourceId: { in: ids }, action: "admin.account.delete" } });
    await prisma.emailVerificationCode.deleteMany({ where: { userId: { in: ids } } });
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: ids.flatMap((i) => [`verify:${i}`, `reset:${i}`]) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    const fresh = (await prisma.user.findMany({ where: { email: { in: [TALENT, CASTING] }, id: { startsWith: "r111" } }, select: { id: true } })).map((u) => u.id);
    if (!preexisting.length) await prisma.user.deleteMany({ where: { id: { in: fresh } } });
    if (createdAdmin) await prisma.user.deleteMany({ where: { email: "contact@agental.co" } });
  };

  beforeAll(async () => {
    preexisting = (await prisma.user.findMany({ where: { email: { in: [TALENT, CASTING] } }, select: { id: true } })).map((u) => u.id);
    await cleanup();
    if (!(await prisma.user.findFirst({ where: { email: "contact@agental.co", isAdmin: true } }))) {
      await prisma.user.deleteMany({ where: { email: "contact@agental.co" } });
      await prisma.user.create({ data: { id: "r111testadmin0001", email: "contact@agental.co", isAdmin: true } });
      createdAdmin = true;
    }
    for (const [i, id] of IDS.entries()) {
      await prisma.user.create({ data: { id, email: `test-r111-${i}@demo.agental.co`, kind: i % 2 ? "CASTING" : "TALENT", accountStatus: "APPROVED", passwordHash: "x" } });
      await prisma.account.create({ data: { userId: id, type: "oauth", provider: "google", providerAccountId: `r111-${id}` } });
      await prisma.verificationToken.create({ data: { identifier: `reset:${id}`, token: `r111-${id}`, expires: new Date(Date.now() + 3600e3) } });
    }
    await prisma.user.create({ data: { id: OTHER_ID, email: OTHER, accountStatus: "APPROVED" } });
  });
  afterAll(cleanup);

  it("deletes the six, creates the two, and is idempotent", async () => {
    const before = await accountCounts();
    await run();
    await run();
    const after = await accountCounts();

    const rows = await prisma.user.findMany({ where: { id: { in: IDS } } });
    const admin = await prisma.user.findFirstOrThrow({ where: { email: "contact@agental.co", isAdmin: true } });
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.deletedAt).not.toBeNull();
      expect(r.deletedById).toBe(admin.id);
      expect(r.deletedPrevStatus).toBe("APPROVED");
      expect(r.accountStatus).toBe("REVOKED");
      expect(r.sessionsValidAfter).not.toBeNull();
      expect(r.deletedEmail).toMatch(/^test-r111-\d@demo\.agental\.co$/);
      expect(r.email).toBe(`deleted-${r.id}@deleted.agental.invalid`);
    }
    expect(await prisma.account.count({ where: { userId: { in: IDS } } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { identifier: { in: IDS.map((i) => `reset:${i}`) } } })).toBe(0);

    const logs = await prisma.auditLog.findMany({ where: { resourceId: { in: IDS }, action: "admin.account.delete" } });
    expect(logs).toHaveLength(6); // once each, even after the second run
    const l = logs.find((x) => x.resourceId === IDS[0])!;
    expect(l.actorUserId).toBe(admin.id);
    expect(JSON.parse(l.before).emailSha256).toBe(createHash("sha256").update("test-r111-0@demo.agental.co").digest("hex"));
    expect(JSON.parse(l.after)).toMatchObject({ emailFreed: true, providerLinksRemoved: 1, via: "round 11.1 group 2, founder's go" });

    // Not in the list: untouched.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: OTHER_ID } })).deletedAt).toBeNull();

    const t = await prisma.user.findMany({ where: { email: { in: [TALENT, CASTING] } } });
    expect(t).toHaveLength(preexisting.length ? 2 : 2);
    const talent = t.find((u) => u.email === TALENT)!;
    const casting = t.find((u) => u.email === CASTING)!;
    expect(talent).toMatchObject({ name: "Agental Test Talent", kind: "TALENT", accountStatus: "TEST", locale: "en", passwordHash: null, emailVerified: null });
    expect(casting).toMatchObject({ name: "Agental Test Casting", kind: "CASTING", accountStatus: "TEST", locale: "en", passwordHash: null, emailVerified: null });
    expect(talent.id).toMatch(/^[a-z0-9]{10,40}$/i);

    const added = t.filter((u) => !preexisting.includes(u.id)).length;
    expect(after.deleted - before.deleted).toBe(6);
    expect(after.accounts - before.accounts).toBe(added - 6);
    expect(after.test - before.test).toBe(added);
  });
});
