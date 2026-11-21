import { describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";

/**
 * src/auth.ts with Google and Apple configured (Apple signing its own client
 * secret), and the signIn callback's routing for each outcome.
 */

const db = {
  account: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock("@/lib/db", () => ({ prisma: db }));

const cookies = {
  readIntentCookie: vi.fn(async () => null as unknown),
  clearIntentCookie: vi.fn(async () => {}),
  writePendingCookie: vi.fn(async () => {}),
};
vi.mock("@/lib/auth/oauth-cookies", () => cookies);

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
process.env.AUTH_GOOGLE_ID = "google-id";
process.env.AUTH_GOOGLE_SECRET = "google-secret";
process.env.AUTH_APPLE_ID = "co.agental.web";
process.env.AUTH_APPLE_TEAM_ID = "TEAM123456";
process.env.AUTH_APPLE_KEY_ID = "KEY1234567";
process.env.AUTH_APPLE_PRIVATE_KEY = await exportPKCS8(privateKey);
delete process.env.AUTH_APPLE_SECRET;

const { buildAuthConfig, enabledOAuthProviders } = await import("@/auth");

type AnyProvider = { id: string; options?: Record<string, unknown> };

describe("auth config with OAuth env", () => {
  it("enables both providers", () => {
    expect(enabledOAuthProviders).toEqual(["google", "apple"]);
  });

  it("asks Google for PKCE and state, and signs an Apple secret", async () => {
    const config = await buildAuthConfig();
    const providers = config.providers as unknown as AnyProvider[];
    expect(providers.map((p) => p.id)).toEqual(["credentials", "google", "apple"]);
    expect(providers[1].options?.checks).toEqual(["pkce", "state"]);
    expect(String(providers[2].options?.clientSecret).split(".")).toHaveLength(3);
  });
});

describe("signIn callback", () => {
  const account = { provider: "google", providerAccountId: "g-1", type: "oidc" };
  const verified = { sub: "g-1", email: "Ana@Example.com", email_verified: true };

  async function run(profile: Record<string, unknown>) {
    const { callbacks } = await buildAuthConfig();
    return callbacks!.signIn!({ user: { id: "x" }, account, profile } as never);
  }

  it("lets Credentials through untouched", async () => {
    const { callbacks } = await buildAuthConfig();
    expect(
      await callbacks!.signIn!({ user: { id: "u" }, account: { provider: "credentials", type: "credentials" } } as never)
    ).toBe(true);
  });

  it("refuses an unverified Google email, in the intent's language", async () => {
    cookies.readIntentCookie.mockResolvedValueOnce({ mode: "signin", locale: "fr" });
    expect(await run({ ...verified, email_verified: false })).toBe("/fr/connexion?error=oauthEmailUnverified");
    expect(cookies.clearIntentCookie).toHaveBeenCalled();
  });

  it("parks a new identity with no kind and asks for one", async () => {
    db.account.findUnique.mockResolvedValueOnce(null);
    db.user.findMany.mockResolvedValueOnce([]);
    expect(await run(verified)).toBe("/en/continuer?choose=1");
    expect(cookies.writePendingCookie).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", providerAccountId: "g-1", email: "ana@example.com" })
    );
  });

  it("refuses an email that already has an account, in any letter case", async () => {
    cookies.readIntentCookie.mockResolvedValueOnce({ mode: "signup", kind: "TALENT", locale: "es" });
    db.account.findUnique.mockResolvedValueOnce(null);
    // Stored as typed at signup, before emails were lowercased.
    db.user.findMany.mockResolvedValueOnce([{ id: "someone", email: "ANA@example.com" }]);
    expect(await run(verified)).toBe("/es/connexion?error=oauthLinkRequiresPassword");
  });

  it("signs in the owner of a linked account", async () => {
    db.account.findUnique.mockResolvedValueOnce({ user: { id: "u1", kind: "TALENT", locale: "en" } });
    expect(await run(verified)).toBe(true);
  });

  it("turns a database failure into the generic error", async () => {
    db.account.findUnique.mockRejectedValueOnce(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await run(verified)).toBe("/en/connexion?error=oauthGeneric");
    spy.mockRestore();
  });
});
