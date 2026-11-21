import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { accountsCsv, accountTimeline, listAccounts } from "@/lib/admin/accounts";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const P = "test-admin-hub-";

describe.skipIf(!local)("admin data hub", () => {
  let id: string;
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${P}a@test.local`, kind: "TALENT", passwordHash: "x", name: "=cmd" } });
    id = u.id;
    await prisma.artistProfile.create({ data: { userId: id, stageName: "Ana Test" } });
    await prisma.roleSearchRequest.create({ data: { userId: id, plan: "FREE", periodKey: "p1", seq: 1, status: "queued" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("lists an account with its facts and filters", async () => {
    const [row] = await listAccounts({ q: P });
    expect(row).toMatchObject({ email: `${P}a@test.local`, audience: "TALENT", plan: "FREE", method: "email", emailVerified: false, website: "none" });
    expect(await listAccounts({ q: P, method: "google" })).toHaveLength(0);
  });

  it("builds a timeline, newest first", async () => {
    const t = await accountTimeline(id);
    expect(t?.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["signup", "search"]));
  });

  it("neutralizes spreadsheet formulas in the CSV", () => {
    const csv = accountsCsv([{ id: "1", name: "=cmd", email: "a@b", audience: "TALENT", plan: "FREE", createdAt: new Date(0), method: "email", emailVerified: true, completeness: 10, mediaCount: 0, website: "none" }]);
    expect(csv).toContain("'=cmd");
  });
});
