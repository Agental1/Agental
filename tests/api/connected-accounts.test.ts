import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Connected accounts against the real database.
 *
 * disconnectProvider locks the user's row with a statement written in SQL
 * and reads from it whether a password exists. A mocked Prisma cannot show
 * that the statement runs or what it returns, so this builds real users and
 * checks the one rule that matters: the last way to sign in is never removed.
 * Only the session is faked. Every row carries a prefix and is removed in
 * afterAll.
 *
 * Needs DATABASE_URL (a local or test database, never production). Skipped
 * otherwise.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const P = "test-connected-accounts-";

let sessionUserId: string | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (sessionUserId ? { user: { id: sessionUserId, kind: "TALENT" } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const refusal = (key: string) => ({ ok: false, error: { key } });

describe.skipIf(!hasDb)("connected accounts, end to end", () => {
  const connectedAt = new Date("2026-11-01T09:00:00Z");
  const usedAt = new Date("2026-11-18T09:00:00Z");

  async function cleanup() {
    const { prisma } = await import("@/lib/db");
    const users = await prisma.user.findMany({
      where: { email: { startsWith: P } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: users.map((user) => user.id) } },
    });
    // Cascades to the Account rows.
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  }

  async function createUser(
    name: string,
    options: { password: boolean; providers: Array<"google" | "apple"> }
  ) {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.create({
      data: {
        email: `${P}${name}@test.local`,
        kind: "TALENT",
        // A placeholder, never a working hash.
        passwordHash: options.password ? "not-a-real-hash" : null,
        accounts: {
          create: options.providers.map((provider) => ({
            type: "oidc",
            provider,
            providerAccountId: `${P}${name}-${provider}-subject`,
            createdAt: connectedAt,
            lastUsedAt: provider === "google" ? usedAt : null,
          })),
        },
      },
    });
    return user.id;
  }

  beforeAll(cleanup);

  afterAll(async () => {
    const { prisma } = await import("@/lib/db");
    await cleanup();
    await prisma.$disconnect();
  });

  it("lists the connections without the subject id, and says whether a password exists", async () => {
    const { listConnectedAccounts, loginMethods } = await import("@/lib/connected-accounts");
    const both = await createUser("list-both", { password: true, providers: ["apple", "google"] });
    const none = await createUser("list-none", { password: true, providers: [] });
    const oauthOnly = await createUser("list-oauth", { password: false, providers: ["apple"] });

    const rows = await listConnectedAccounts(both);
    expect(rows).toEqual([
      { provider: "google", connectedAt, lastUsedAt: usedAt, hasPassword: true },
      { provider: "apple", connectedAt, lastUsedAt: null, hasPassword: true },
    ]);
    expect(JSON.stringify(rows)).not.toContain("subject");
    expect(await loginMethods(both)).toEqual({ hasPassword: true, providers: ["apple", "google"] });

    expect(await listConnectedAccounts(none)).toEqual([]);
    expect(await loginMethods(none)).toEqual({ hasPassword: true, providers: [] });

    expect(await listConnectedAccounts(oauthOnly)).toEqual([
      { provider: "apple", connectedAt, lastUsedAt: null, hasPassword: false },
    ]);
    expect(await loginMethods("no-such-user")).toEqual({ hasPassword: false, providers: [] });
  });

  it("refuses to remove the only way in, and leaves the connection in place", async () => {
    const { prisma } = await import("@/lib/db");
    const { disconnectProvider } = await import("@/app/actions/connected-accounts");
    const userId = await createUser("last", { password: false, providers: ["google"] });

    sessionUserId = userId;
    expect(await disconnectProvider("google")).toEqual(refusal("errors.lastLoginMethod"));
    expect(await disconnectProvider("apple")).toEqual(refusal("errors.providerNotConnected"));

    expect(await prisma.account.count({ where: { userId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { actorUserId: userId } })).toBe(0);
  });

  it("disconnects a provider when a password remains, and audits it", async () => {
    const { prisma } = await import("@/lib/db");
    const { disconnectProvider } = await import("@/app/actions/connected-accounts");
    const { listConnectedAccounts } = await import("@/lib/connected-accounts");
    const userId = await createUser("password", { password: true, providers: ["google"] });
    const bystander = await createUser("bystander", { password: true, providers: ["google"] });

    sessionUserId = userId;
    expect(await disconnectProvider("google")).toEqual({ ok: true });

    expect(await prisma.account.count({ where: { userId } })).toBe(0);
    expect(await listConnectedAccounts(userId)).toEqual([]);
    // Someone else's connection to the same provider is untouched.
    expect(await prisma.account.count({ where: { userId: bystander } })).toBe(1);
    // A second try finds nothing to remove.
    expect(await disconnectProvider("google")).toEqual(refusal("errors.providerNotConnected"));

    const entries = await prisma.auditLog.findMany({ where: { actorUserId: userId } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "auth.oauth.unlink",
      resourceType: "User",
      resourceId: userId,
    });
    expect(JSON.parse(entries[0].before)).toEqual({ providers: ["google"], hasPassword: true });
    expect(JSON.parse(entries[0].after)).toEqual({ provider: "google", providers: [] });
    expect(JSON.stringify(entries)).not.toContain("subject");
  });

  it("lets go of one of two providers, then keeps the last one", async () => {
    const { prisma } = await import("@/lib/db");
    const { disconnectProvider } = await import("@/app/actions/connected-accounts");
    const userId = await createUser("two", { password: false, providers: ["google", "apple"] });

    sessionUserId = userId;
    expect(await disconnectProvider("google")).toEqual({ ok: true });
    expect(await disconnectProvider("apple")).toEqual(refusal("errors.lastLoginMethod"));

    const left = await prisma.account.findMany({ where: { userId }, select: { provider: true } });
    expect(left).toEqual([{ provider: "apple" }]);
  });

  it("is refused without a session, and for an account that no longer exists", async () => {
    const { prisma } = await import("@/lib/db");
    const { disconnectProvider } = await import("@/app/actions/connected-accounts");
    const userId = await createUser("gone", { password: true, providers: ["google"] });

    sessionUserId = null;
    expect(await disconnectProvider("google")).toEqual(refusal("errors.unauthorized"));
    expect(await prisma.account.count({ where: { userId } })).toBe(1);

    // A session can outlive its account.
    sessionUserId = "no-such-user";
    expect(await disconnectProvider("google")).toEqual(refusal("errors.unauthorized"));
  });
});
