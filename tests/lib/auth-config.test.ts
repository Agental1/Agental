import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

/**
 * src/auth.ts with no OAuth variables: the state of every build host, CI run
 * and fresh checkout. It must load, offer Credentials only, and fail closed
 * when an OAuth sign-in has no Account row behind it. Credentials must find
 * an account whatever letter case its email was stored in.
 */

const findUnique = vi.fn();
const findMany = vi.fn();
const userFindUnique = vi.fn();
// Round 8d: the credentials check is rate limited (src/lib/abuse.ts); allowed here
// unless a test says otherwise.
const authAllowed = vi.fn(async () => true);
vi.mock("@/lib/abuse", () => ({ authAllowed }));
vi.mock("@/lib/db", () => ({
  prisma: { account: { findUnique }, user: { findMany, findUnique: userFindUnique, update: vi.fn(async () => ({})) } },
}));
vi.mock("@/lib/auth/oauth-cookies", () => ({
  readIntentCookie: vi.fn(async () => null),
  clearIntentCookie: vi.fn(async () => {}),
  writePendingCookie: vi.fn(async () => {}),
}));

for (const name of Object.keys(process.env)) {
  if (/^AUTH_(GOOGLE|APPLE)_/.test(name)) delete process.env[name];
}

const { buildAuthConfig, enabledOAuthProviders } = await import("@/auth");

describe("auth config without OAuth env", () => {
  it("enables no OAuth provider", () => {
    expect(enabledOAuthProviders).toEqual([]);
  });

  it("builds with Credentials only and our pages", async () => {
    const config = await buildAuthConfig();
    expect(config.providers).toHaveLength(1);
    expect(config.pages).toEqual({ signIn: "/connexion", error: "/connexion" });
    expect(config.session?.strategy).toBe("jwt");
  });
});

describe("jwt callback", () => {
  it("returns null for an OAuth sign-in with no Account row", async () => {
    const { callbacks } = await buildAuthConfig();
    findUnique.mockResolvedValueOnce(null);
    const token = await callbacks!.jwt!({
      token: { sub: "random-uuid" },
      user: { id: "random-uuid" },
      account: { provider: "google", providerAccountId: "g-1", type: "oidc" },
    } as never);
    expect(token).toBeNull();
  });

  it("puts the database user in the token for an OAuth sign-in", async () => {
    const { callbacks } = await buildAuthConfig();
    findUnique.mockResolvedValueOnce({
      user: { id: "db-user", email: "ana@example.com", name: "Ana", image: null, kind: "CASTING", locale: "es" },
    });
    const token = await callbacks!.jwt!({
      token: { sub: "random-uuid" },
      user: { id: "random-uuid" },
      account: { provider: "google", providerAccountId: "g-1", type: "oidc" },
    } as never);
    expect(token).toMatchObject({ sub: "db-user", kind: "CASTING", locale: "es", email: "ana@example.com" });
  });

  it("starts a password session without a database read and stamps when it began", async () => {
    const { callbacks } = await buildAuthConfig();
    findUnique.mockClear();
    userFindUnique.mockClear();
    const before = Date.now();
    const token = await callbacks!.jwt!({
      token: { sub: "u1" },
      user: { id: "u1", kind: "TALENT", locale: "fr" },
      account: { provider: "credentials", providerAccountId: "u1", type: "credentials" },
    } as never);
    expect(token).toMatchObject({ sub: "u1", kind: "TALENT", locale: "fr" });
    expect(token!.authAt).toBeGreaterThanOrEqual(before);
    expect(findUnique).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("jwt callback on an ordinary request", () => {
  const cutOff = new Date("2026-11-19T10:00:00.500Z");
  const call = async (token: Record<string, unknown>) => {
    const { callbacks } = await buildAuthConfig();
    return callbacks!.jwt!({ token } as never);
  };

  it("keeps a session whose account exists and has no cut-off", async () => {
    userFindUnique.mockResolvedValueOnce({ sessionsValidAfter: null });
    expect(await call({ sub: "u1", kind: "TALENT", authAt: 1 })).toEqual({ sub: "u1", kind: "TALENT", authAt: 1 });
    expect(userFindUnique).toHaveBeenLastCalledWith({
      where: { id: "u1" },
      select: { sessionsValidAfter: true, deletedAt: true, lastSignInAt: true },
    });
  });

  it("ends the session of a deleted account", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    expect(await call({ sub: "gone", authAt: Date.now() })).toBeNull();
  });

  it("ends the session of an account an admin deleted (round 9, restorable)", async () => {
    userFindUnique.mockResolvedValueOnce({ sessionsValidAfter: null, deletedAt: new Date() });
    expect(await call({ sub: "u2", authAt: Date.now() })).toBeNull();
  });

  it("refuses a session that began before the cut-off and keeps one that began after", async () => {
    userFindUnique.mockResolvedValue({ sessionsValidAfter: cutOff });
    expect(await call({ sub: "u1", authAt: cutOff.getTime() - 1 })).toBeNull();
    expect(await call({ sub: "u1", authAt: cutOff.getTime() })).not.toBeNull();
    expect(await call({ sub: "u1", authAt: cutOff.getTime() + 1 })).not.toBeNull();
    userFindUnique.mockReset();
  });

  it("falls back to iat for sessions older than the authAt claim", async () => {
    userFindUnique.mockResolvedValue({ sessionsValidAfter: cutOff });
    const sameSecond = Math.floor(cutOff.getTime() / 1000);
    // iat is rounded down to the second, so a token from that second reads as older.
    expect(await call({ sub: "u1", iat: sameSecond })).toBeNull();
    expect(await call({ sub: "u1", iat: sameSecond + 1 })).not.toBeNull();
    expect(await call({ sub: "u1" })).toBeNull();
    userFindUnique.mockReset();
  });
});

describe("Credentials sign-in", () => {
  // Cost 4 keeps the suite fast; compare reads the cost from the hash.
  const hash = (password: string) => bcrypt.hashSync(password, 4);
  const row = (id: string, email: string, password: string | null) => ({
    id,
    email,
    name: null,
    kind: "TALENT",
    locale: "en",
    passwordHash: password && hash(password),
  });

  async function authorize(email: string, password: string) {
    const config = await buildAuthConfig();
    const credentials = config.providers[0] as unknown as {
      options: { authorize: (raw: unknown) => Promise<{ id: string } | null> };
    };
    return credentials.options.authorize({ email, password });
  }

  it("refuses before any password check once the sign-in limit is reached (direct POST included)", async () => {
    authAllowed.mockResolvedValueOnce(false);
    findMany.mockClear();
    expect(await authorize("ana@gmail.com", "right-password")).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("finds an account stored with its signup casing", async () => {
    findMany.mockResolvedValueOnce([row("legacy", "Ana@Gmail.com", "right-password")]);
    expect(await authorize("ana@gmail.com", "right-password")).toMatchObject({ id: "legacy" });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { email: { equals: "ana@gmail.com", mode: "insensitive" } } })
    );
  });

  it("signs each owner into their own row when two rows share the address", async () => {
    const rows = [row("lowercase", "ana@gmail.com", "squatter"), row("legacy", "Ana@Gmail.com", "owner")];
    findMany.mockResolvedValueOnce(rows);
    expect(await authorize("Ana@Gmail.com", "owner")).toMatchObject({ id: "legacy" });
    findMany.mockResolvedValueOnce(rows);
    expect(await authorize("ana@gmail.com", "squatter")).toMatchObject({ id: "lowercase" });
  });

  it("refuses a wrong password, a provider-only account and an ILIKE wildcard match", async () => {
    findMany.mockResolvedValueOnce([row("legacy", "Ana@Gmail.com", "right-password")]);
    expect(await authorize("ana@gmail.com", "wrong")).toBeNull();
    findMany.mockResolvedValueOnce([row("google", "ana@gmail.com", null)]);
    expect(await authorize("ana@gmail.com", "anything")).toBeNull();
    findMany.mockResolvedValueOnce([row("other", "anaXruiz@gmail.com", "pw")]);
    expect(await authorize("ana_ruiz@gmail.com", "pw")).toBeNull();
  });
});
