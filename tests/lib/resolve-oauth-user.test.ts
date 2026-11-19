import { describe, expect, it, vi } from "vitest";
import { resolveOAuthUser, type OAuthIntent } from "@/lib/auth/resolve-oauth-user";
import type { OAuthIdentity } from "@/lib/auth/oauth-identity";

/**
 * The account rules with a mocked Prisma. What is under test is the decision
 * (sign in, create, park, refuse), not the query shapes, which the database
 * enforces anyway through @@unique([provider, providerAccountId]).
 */

const identity: OAuthIdentity = {
  provider: "google",
  providerAccountId: "google-sub-1",
  email: "ana@example.com",
  name: "Ana Ruiz",
  image: null,
};

const signup: OAuthIntent = { mode: "signup", kind: "CASTING", locale: "es" };
const now = new Date("2026-11-18T12:00:00Z");

function mockDb(opts: {
  account?: { user: { id: string; kind: string; locale: string } } | null;
  /** What the case-insensitive email query returns. */
  usersByEmail?: { id: string; email: string }[];
  createError?: unknown;
}) {
  const tx = {
    user: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (opts.createError) throw opts.createError;
        return { id: "new-user", ...args.data };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    account: { findUnique: vi.fn(async () => opts.account ?? null) },
    user: { findMany: vi.fn(async () => opts.usersByEmail ?? []) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, tx, raw: db };
}

describe("resolveOAuthUser", () => {
  it("signs in the owner of an existing Account, whatever the intent", async () => {
    const { db, tx } = mockDb({
      account: { user: { id: "u1", kind: "TALENT", locale: "fr" } },
    });
    const result = await resolveOAuthUser(db, identity, signup, now);
    expect(result).toEqual({ type: "signedIn", userId: "u1", kind: "TALENT", locale: "fr" });
    // The intent said CASTING; the existing kind wins and nothing is written.
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("creates User, Account and audit entry for a new signup", async () => {
    const { db, tx, raw } = mockDb({});
    const result = await resolveOAuthUser(db, identity, signup, now);
    expect(result).toEqual({ type: "created", userId: "new-user", kind: "CASTING", locale: "es" });
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: "ana@example.com",
        name: "Ana Ruiz",
        image: null,
        kind: "CASTING",
        locale: "es",
        emailVerified: now,
        passwordHash: null,
        accounts: {
          create: { type: "oidc", provider: "google", providerAccountId: "google-sub-1" },
        },
      },
    });
    const audit = tx.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, string> }];
    expect(audit[0].data).toMatchObject({ action: "user.signup", resourceId: "new-user", actorUserId: "new-user" });
    expect(JSON.parse(audit[0].data.after)).toEqual({ kind: "CASTING", method: "google" });
  });

  it("parks the identity when there is no intent", async () => {
    const { db, tx } = mockDb({});
    expect(await resolveOAuthUser(db, identity, null, now)).toEqual({ type: "pending" });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("parks the identity for a sign-in intent with no kind", async () => {
    const { db } = mockDb({});
    const intent: OAuthIntent = { mode: "signin", locale: "en" };
    expect(await resolveOAuthUser(db, identity, intent, now)).toEqual({ type: "pending" });
  });

  it("refuses an email that already belongs to another account", async () => {
    // A password account, or one created by the other provider: either way,
    // nothing proves who registered the email first. V1 never links.
    const { db, tx } = mockDb({ usersByEmail: [{ id: "someone", email: "ana@example.com" }] });
    expect(await resolveOAuthUser(db, identity, signup, now)).toEqual({
      type: "refused",
      error: "oauthLinkRequiresPassword",
    });
    expect(await resolveOAuthUser(db, identity, null, now)).toEqual({
      type: "refused",
      error: "oauthLinkRequiresPassword",
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("refuses an email stored in another letter case before emails were normalized", async () => {
    // From /connexion this used to come back "pending", and /continuer then
    // opened a second, empty account next to the talent's real one.
    const { db, tx, raw } = mockDb({ usersByEmail: [{ id: "legacy", email: "Ana@Example.com" }] });
    expect(await resolveOAuthUser(db, identity, { mode: "signin", locale: "en" }, now)).toEqual({
      type: "refused",
      error: "oauthLinkRequiresPassword",
    });
    expect(raw.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ana@example.com", mode: "insensitive" } },
      })
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("ignores a row that only matched through an ILIKE wildcard", async () => {
    const underscored = { ...identity, email: "ana_ruiz@example.com" };
    const { db, tx } = mockDb({ usersByEmail: [{ id: "other", email: "ana.ruiz@example.com" }] });
    expect(await resolveOAuthUser(db, underscored, signup, now)).toMatchObject({ type: "created" });
    expect(tx.user.create).toHaveBeenCalledTimes(1);
  });

  it("refuses an identity without a verified email", async () => {
    const { db, raw } = mockDb({});
    expect(await resolveOAuthUser(db, null, signup, now)).toEqual({
      type: "refused",
      error: "oauthEmailUnverified",
    });
    expect(raw.account.findUnique).not.toHaveBeenCalled();
  });

  it("settles a lost race on the existing Account", async () => {
    const { db, raw } = mockDb({ createError: { code: "P2002" } });
    raw.account.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: { id: "u2", kind: "CASTING", locale: "es" } } as never);
    expect(await resolveOAuthUser(db, identity, signup, now)).toEqual({
      type: "signedIn",
      userId: "u2",
      kind: "CASTING",
      locale: "es",
    });
  });

  it("refuses when the email was taken during the race", async () => {
    const { db } = mockDb({ createError: { code: "P2002" } });
    expect(await resolveOAuthUser(db, identity, signup, now)).toEqual({
      type: "refused",
      error: "oauthLinkRequiresPassword",
    });
  });

  it("rethrows other database errors", async () => {
    const { db } = mockDb({ createError: new Error("connection lost") });
    await expect(resolveOAuthUser(db, identity, signup, now)).rejects.toThrow("connection lost");
  });
});
