import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Round 11 (r111): after Admin > Accounts > Delete, signing up again with the
 * same address must work at once, by password and by Google, and a founder
 * testing many sign-ups from one network must not hit "Too many attempts".
 * Real local database.
 */
const P = "test-r111-signup-";
const ip = `198.51.100.${randomInt(1, 254)}`;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": ip }) }));
vi.mock("@/auth", () => ({ signIn: async () => undefined, signOut: async () => undefined }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/consent", () => ({ readConsentCookie: async () => null }));
vi.mock("@/lib/email-code", () => ({ sendEmailCode: async () => ({ ok: false }) }));

const { signupAction } = await import("@/app/actions/auth");
const { softDeleteAccounts } = await import("@/lib/admin/account-removal");
const { resolveOAuthUser } = await import("@/lib/auth/resolve-oauth-user");
const { abuseKeyHash, emailRateLimitKeys, userRateLimitKeys } = await import("@/lib/rate-key");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const email = `${P}${Date.now()}@test.local`;
const password = "Long-Test-Passphrase-r111!";
const ipKeys = [`signup:ip:${abuseKeyHash(ip)}`, `signup-created:ip:${abuseKeyHash(ip)}`];
const created: string[] = [];
let adminId: string;

function form(address: string): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ email: address, password, kind: "TALENT", locale: "en", privacy: "yes" })) f.set(k, v);
  return f;
}

async function idsFor(address: string): Promise<string[]> {
  return (await prisma.user.findMany({ where: { OR: [{ email: address }, { deletedEmail: address }] }, select: { id: true } })).map((u) => u.id);
}

describe.skipIf(!local)("sign-up after an admin deletes the account (r111)", () => {
  beforeAll(async () => {
    adminId = (await prisma.user.create({ data: { email: `${P}admin-${Date.now()}@test.local`, isAdmin: true, accountStatus: "STAFF" } })).id;
  });
  afterAll(async () => {
    const ids = [...new Set([...created, adminId, ...(await idsFor(email))])];
    await prisma.rateLimitEvent.deleteMany({
      where: { key: { in: [...ipKeys, ...emailRateLimitKeys(email), ...ids.flatMap(userRateLimitKeys)] } },
    });
    const extra = await prisma.user.findMany({ where: { email: { startsWith: P } }, select: { id: true } });
    const all = [...new Set([...ids, ...extra.map((u) => u.id)])];
    await prisma.auditLog.deleteMany({ where: { OR: [{ resourceId: { in: all } }, { actorUserId: { in: all } }] } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
  });

  it("signs up, deletes, and signs up again with the same email and password", async () => {
    expect(await signupAction(undefined, form(email))).toBeUndefined();
    const [first] = await idsFor(email);
    created.push(first);
    // A second try for the taken address is refused as taken, and counted.
    expect(await signupAction(undefined, form(email))).toEqual({ error: { key: "errors.emailTaken" } });
    // Counters from earlier attempts on this address, as a tester would leave them.
    const keys = [...emailRateLimitKeys(email), ...userRateLimitKeys(first)];
    await prisma.rateLimitEvent.createMany({ data: keys.flatMap((key) => Array.from({ length: 10 }, () => ({ key, createdAt: new Date() }))) });

    expect(await softDeleteAccounts(adminId, [first])).toEqual({ ok: true, done: 1, skipped: 0 });
    expect(await prisma.rateLimitEvent.count({ where: { key: { in: keys } } })).toBe(0);

    expect(await signupAction(undefined, form(email))).toBeUndefined();
    const again = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true, deletedAt: true } });
    expect(again.id).not.toBe(first);
    expect(again.deletedAt).toBeNull();
    created.push(again.id);
  });

  it("lets one network create more than the old 5 accounts per hour", async () => {
    for (let i = 0; i < 7; i += 1) {
      const address = `${P}many-${i}-${Date.now()}@test.local`;
      expect(await signupAction(undefined, form(address))).toBeUndefined();
      created.push(...(await idsFor(address)));
    }
  });

  it("then Google creates an account for the same address once it is deleted again", async () => {
    const [current] = (await prisma.user.findMany({ where: { email, deletedAt: null }, select: { id: true } })).map((u) => u.id);
    expect(await softDeleteAccounts(adminId, [current])).toEqual({ ok: true, done: 1, skipped: 0 });
    const res = await resolveOAuthUser(
      prisma,
      { provider: "google", providerAccountId: `${P}${Date.now()}`, email, emailAuthoritative: true, name: null, image: null },
      { mode: "signup", kind: "TALENT", locale: "en" }
    );
    expect(res.type).toBe("created");
    if (res.type === "created") created.push(res.userId);
  });
});
