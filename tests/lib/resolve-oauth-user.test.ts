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
  // The suite's default identity is one the provider is the authority for.
  emailAuthoritative: true,
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
  /** The existing account a link would join, as the transaction reads it. */
  existing?: {
    passwordHash: string | null;
    accounts: number;
    emailVerified?: Date | null;
    name?: string | null;
  };
  linkError?: unknown;
  /** Makes the "last used" timestamp write fail. */
  touchError?: unknown;
  activeMandates?: number;
}) {
  const tx = {
    user: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (opts.createError) throw opts.createError;
        return { id: "new-user", ...args.data };
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) =>
        opts.existing
          ? {
              id: args.where.id,
              kind: "TALENT",
              locale: "fr",
              name: opts.existing.name ?? null,
              image: null,
              emailVerified: opts.existing.emailVerified ?? null,
              passwordHash: opts.existing.passwordHash,
              _count: { accounts: opts.existing.accounts },
            }
          : null
      ),
      update: vi.fn(async () => ({})),
    },
    account: {
      create: vi.fn(async () => {
        if (opts.linkError) throw opts.linkError;
        return {};
      }),
    },
    mandat: { updateMany: vi.fn(async () => ({ count: opts.activeMandates ?? 0 })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    account: {
      findUnique: vi.fn(async () => opts.account ?? null),
      update: vi.fn(async () => {
        if (opts.touchError) throw opts.touchError;
        return {};
      }),
    },
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
    // The intent said CASTING; the existing kind wins and no user is written.
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("notes when a connection was last used, and never fails a sign-in over it", async () => {
    const ok = mockDb({ account: { user: { id: "u1", kind: "TALENT", locale: "fr" } } });
    await resolveOAuthUser(ok.db, identity, null, now);
    expect(ok.raw.account.update).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: { provider: "google", providerAccountId: "google-sub-1" },
      },
      data: { lastUsedAt: now },
    });

    const failing = mockDb({
      account: { user: { id: "u1", kind: "TALENT", locale: "fr" } },
      touchError: new Error("database busy"),
    });
    expect(await resolveOAuthUser(failing.db, identity, null, now)).toMatchObject({
      type: "signedIn",
      userId: "u1",
    });
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
        // Round 11.1: the sentence under the Google button records the Privacy acceptance.
        privacyAcceptedAt: now,
        privacyVersion: "2026-11-24",
        accounts: {
          create: {
            type: "oidc",
            provider: "google",
            providerAccountId: "google-sub-1",
            createdAt: now,
            lastUsedAt: now,
          },
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

  it("refuses to join an account when the provider is not the authority for the address", async () => {
    // Verified once by the provider, hosted elsewhere: that is no proof of
    // who owns the mailbox today, so the existing account is left alone.
    const weak = { ...identity, emailAuthoritative: false };
    const { db, tx } = mockDb({
      usersByEmail: [{ id: "someone", email: "ana@example.com" }],
      existing: { passwordHash: "hash", accounts: 0 },
    });
    for (const intent of [signup, null]) {
      expect(await resolveOAuthUser(db, weak, intent, now)).toEqual({
        type: "refused",
        error: "oauthLinkRequiresPassword",
      });
    }
    expect(tx.account.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("refuses when two rows answer to the address", async () => {
    const { db, tx } = mockDb({
      usersByEmail: [
        { id: "a", email: "ana@example.com" },
        { id: "b", email: "Ana@Example.com" },
      ],
    });
    expect(await resolveOAuthUser(db, identity, signup, now)).toEqual({
      type: "refused",
      error: "oauthLinkRequiresPassword",
    });
    expect(tx.account.create).not.toHaveBeenCalled();
  });

  it("takes over a password account whose email was never proven", async () => {
    // Anyone could have registered this address first. The provider's owner
    // gets the account; the password, old sessions and the mandate do not survive.
    const { db, tx } = mockDb({
      usersByEmail: [{ id: "legacy", email: "Ana@Example.com" }],
      existing: { passwordHash: "hash", accounts: 0 },
      activeMandates: 1,
    });
    const result = await resolveOAuthUser(db, identity, { mode: "signin", locale: "en" }, now);
    expect(result).toEqual({
      type: "signedIn",
      userId: "legacy",
      kind: "TALENT",
      locale: "fr",
      linked: "takeover",
    });
    expect(tx.account.create).toHaveBeenCalledWith({
      data: {
        userId: "legacy",
        type: "oidc",
        provider: "google",
        providerAccountId: "google-sub-1",
        createdAt: now,
        lastUsedAt: now,
      },
    });
    expect(tx.mandat.updateMany).toHaveBeenCalledWith({
      where: { profile: { userId: "legacy" }, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "legacy" },
      data: {
        emailVerified: now,
        name: "Ana Ruiz",
        image: null,
        passwordHash: null,
        sessionsValidAfter: now,
      },
    });
    const audit = tx.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, string> }];
    expect(audit[0].data).toMatchObject({ action: "auth.oauth.link_takeover", resourceId: "legacy" });
    expect(JSON.parse(audit[0].data.after)).toEqual({
      provider: "google",
      passwordRemoved: true,
      mandatesRevoked: 1,
    });
    // No second account, which is what a refusal used to lead to.
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("simply adds the identity when another provider already proved the email", async () => {
    const verifiedAt = new Date("2026-10-01T00:00:00Z");
    const { db, tx } = mockDb({
      usersByEmail: [{ id: "u9", email: "ana@example.com" }],
      existing: { passwordHash: null, accounts: 1, emailVerified: verifiedAt, name: "Ana R." },
    });
    expect(await resolveOAuthUser(db, { ...identity, provider: "apple" }, null, now)).toMatchObject({
      type: "signedIn",
      userId: "u9",
      linked: "linked",
    });
    expect(tx.mandat.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u9" },
      data: { emailVerified: verifiedAt, name: "Ana R.", image: null },
    });
    const audit = tx.auditLog.create.mock.calls[0] as unknown as [{ data: Record<string, string> }];
    expect(audit[0].data.action).toBe("auth.oauth.link");
  });

  it("keeps the password of an account another provider already proved", async () => {
    const { db, tx } = mockDb({
      usersByEmail: [{ id: "u9", email: "ana@example.com" }],
      existing: { passwordHash: "hash", accounts: 1 },
    });
    expect(await resolveOAuthUser(db, identity, null, now)).toMatchObject({ linked: "linked" });
    const data = (tx.user.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).not.toHaveProperty("passwordHash");
    expect(data).not.toHaveProperty("sessionsValidAfter");
  });

  it("settles a double submit of the same link", async () => {
    const { db, raw } = mockDb({
      usersByEmail: [{ id: "u9", email: "ana@example.com" }],
      existing: { passwordHash: null, accounts: 1 },
      linkError: { code: "P2002" },
    });
    raw.account.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: { id: "u9", kind: "TALENT", locale: "fr" } } as never);
    expect(await resolveOAuthUser(db, identity, null, now)).toEqual({
      type: "signedIn",
      userId: "u9",
      kind: "TALENT",
      locale: "fr",
    });
  });

  it("looks the address up in any letter case", async () => {
    const { db, raw } = mockDb({});
    await resolveOAuthUser(db, identity, null, now);
    expect(raw.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ana@example.com", mode: "insensitive" } },
      })
    );
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
