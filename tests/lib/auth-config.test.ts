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
vi.mock("@/lib/db", () => ({ prisma: { account: { findUnique }, user: { findMany } } }));
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

  it("keeps the Credentials path free of database reads", async () => {
    const { callbacks } = await buildAuthConfig();
    findUnique.mockClear();
    const token = await callbacks!.jwt!({
      token: { sub: "u1" },
      user: { id: "u1", kind: "TALENT", locale: "fr" },
      account: { provider: "credentials", providerAccountId: "u1", type: "credentials" },
    } as never);
    expect(token).toMatchObject({ sub: "u1", kind: "TALENT", locale: "fr" });
    const plain = await callbacks!.jwt!({ token: { sub: "u1", kind: "TALENT" } } as never);
    expect(plain).toEqual({ sub: "u1", kind: "TALENT" });
    expect(findUnique).not.toHaveBeenCalled();
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
