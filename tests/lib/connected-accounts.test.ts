import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Connected accounts listing with a mocked database. What is under test:
 * the shape handed to the screen, that the provider's subject id, the token
 * columns and the password hash are never selected, and the rule that decides
 * whether a provider may be disconnected.
 */

const db = {
  account: { findMany: vi.fn() },
  user: { count: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: db }));

const { disconnectVerdict, listConnectedAccounts, loginMethods } = await import(
  "@/lib/connected-accounts"
);

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.clearAllMocks();
  db.account.findMany.mockResolvedValue([]);
  db.user.count.mockResolvedValue(0);
});

describe("listConnectedAccounts", () => {
  it("returns one row per provider, Google first, with the password answer on each", async () => {
    db.account.findMany.mockResolvedValue([
      { provider: "apple", createdAt: at("2026-11-02T00:00:00Z"), lastUsedAt: null },
      { provider: "google", createdAt: at("2026-11-01T00:00:00Z"), lastUsedAt: at("2026-11-18T00:00:00Z") },
    ]);
    db.user.count.mockResolvedValue(1);
    expect(await listConnectedAccounts("u1")).toEqual([
      {
        provider: "google",
        connectedAt: at("2026-11-01T00:00:00Z"),
        lastUsedAt: at("2026-11-18T00:00:00Z"),
        hasPassword: true,
      },
      {
        provider: "apple",
        connectedAt: at("2026-11-02T00:00:00Z"),
        lastUsedAt: null,
        hasPassword: true,
      },
    ]);
  });

  it("reports no password for an account that signs in with a provider only", async () => {
    db.account.findMany.mockResolvedValue([{ provider: "google", createdAt: null, lastUsedAt: null }]);
    db.user.count.mockResolvedValue(0);
    // Connections made before the dates were recorded have none.
    expect(await listConnectedAccounts("u1")).toEqual([
      { provider: "google", connectedAt: null, lastUsedAt: null, hasPassword: false },
    ]);
  });

  it("is empty when no provider is connected", async () => {
    expect(await listConnectedAccounts("u1")).toEqual([]);
  });

  it("selects the provider and two dates, and nothing that identifies or authenticates", async () => {
    await listConnectedAccounts("u1");
    const query = db.account.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ userId: "u1", provider: { in: ["google", "apple"] } });
    expect(query.select).toEqual({ provider: true, createdAt: true, lastUsedAt: true });
    // The password is asked about as a count, so the hash is never read.
    expect(db.user.count).toHaveBeenCalledWith({
      where: { id: "u1", passwordHash: { not: null } },
    });
  });

  it("drops any column a wider query would bring back", async () => {
    db.account.findMany.mockResolvedValue([
      {
        provider: "google",
        createdAt: null,
        lastUsedAt: null,
        providerAccountId: "1234567890",
        access_token: "ya29.token",
        refresh_token: "1//refresh",
        id_token: "eyJ.id.token",
      },
    ]);
    const [row] = await listConnectedAccounts("u1");
    expect(Object.keys(row).sort()).toEqual(["connectedAt", "hasPassword", "lastUsedAt", "provider"]);
    const text = JSON.stringify(row);
    for (const secret of ["1234567890", "ya29.token", "1//refresh", "eyJ.id.token"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("merges two connections of one provider: first joined, last used", async () => {
    db.account.findMany.mockResolvedValue([
      { provider: "google", createdAt: at("2026-11-05T00:00:00Z"), lastUsedAt: at("2026-11-06T00:00:00Z") },
      { provider: "google", createdAt: at("2026-11-01T00:00:00Z"), lastUsedAt: at("2026-11-10T00:00:00Z") },
    ]);
    expect(await listConnectedAccounts("u1")).toEqual([
      {
        provider: "google",
        connectedAt: at("2026-11-01T00:00:00Z"),
        lastUsedAt: at("2026-11-10T00:00:00Z"),
        hasPassword: false,
      },
    ]);
  });

  it("ignores a provider this app does not offer", async () => {
    db.account.findMany.mockResolvedValue([{ provider: "github", createdAt: null, lastUsedAt: null }]);
    expect(await listConnectedAccounts("u1")).toEqual([]);
  });
});

describe("loginMethods", () => {
  it("says whether there is a password and which providers are connected", async () => {
    db.account.findMany.mockResolvedValue([{ provider: "google" }, { provider: "apple" }, { provider: "google" }]);
    db.user.count.mockResolvedValue(1);
    expect(await loginMethods("u1")).toEqual({ hasPassword: true, providers: ["apple", "google"] });
    expect(db.account.findMany.mock.calls[0][0]).toEqual({
      where: { userId: "u1" },
      select: { provider: true },
    });
  });

  it("answers for an account with a password and no provider, and for an unknown user", async () => {
    db.user.count.mockResolvedValue(1);
    expect(await loginMethods("u1")).toEqual({ hasPassword: true, providers: [] });
    db.user.count.mockResolvedValue(0);
    expect(await loginMethods("nobody")).toEqual({ hasPassword: false, providers: [] });
  });
});

describe("disconnectVerdict", () => {
  it("says not connected when there is no such connection", () => {
    expect(disconnectVerdict({ hasPassword: true, providers: [] }, "google")).toBe("notConnected");
    expect(disconnectVerdict({ hasPassword: true, providers: ["apple"] }, "google")).toBe("notConnected");
  });

  it("refuses to remove the only way in", () => {
    expect(disconnectVerdict({ hasPassword: false, providers: ["google"] }, "google")).toBe("lastMethod");
  });

  it("allows it when a password remains", () => {
    expect(disconnectVerdict({ hasPassword: true, providers: ["google"] }, "google")).toBe("ok");
  });

  it("allows it when another provider remains", () => {
    expect(disconnectVerdict({ hasPassword: false, providers: ["apple", "google"] }, "google")).toBe("ok");
    expect(disconnectVerdict({ hasPassword: false, providers: ["apple", "google"] }, "apple")).toBe("ok");
  });
});
