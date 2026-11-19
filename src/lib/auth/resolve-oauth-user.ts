import type { PrismaClient } from "@/generated/prisma/client";
import type { UserKind } from "@/domain/enums";
import type { Locale } from "@/i18n/routing";
import type { OAuthIdentity } from "./oauth-identity";
import { findUsersByEmail } from "./user-by-email";

/**
 * Decide what a verified Google or Apple identity becomes.
 *
 * There is no Auth.js adapter: its linking policy is all-or-nothing, never
 * reads email_verified, and would create users with the schema's default kind
 * and locale. Users and accounts are created here instead, by rules we own:
 *
 * 1. An Account for (provider, sub) exists: sign in as its user.
 * 2. A User already has this email: the person must end up on that account,
 *    never on a second one. The provider joins it when it is the authority
 *    for the address (identity.emailAuthoritative). What that does to the
 *    account depends on whether its email was ever proven: see linkOAuthUser.
 *    Two rows answering to one address (letter-case twins from before emails
 *    were normalized), or a provider that is not the authority, are refused.
 * 3. No user, and the person came from a signup page (intent with a kind):
 *    create User and Account together.
 * 4. No user and no kind: hand back "pending" so the caller can park the
 *    identity in a signed cookie and ask talent or casting director.
 *
 * The database client is a parameter so the rules are tested against a mock.
 */

export type OAuthIntent = {
  mode: "signin" | "signup";
  kind?: UserKind;
  locale: Locale;
};

export type OAuthRefusal =
  | "oauthEmailUnverified"
  | "oauthLinkRequiresPassword"
  | "oauthGeneric";

export type ResolveResult =
  | {
      type: "signedIn";
      userId: string;
      kind: string;
      locale: string;
      /**
       * Set when this sign-in joined an existing account. "takeover" means the
       * account's password was never proven, so it was removed and every
       * earlier session and mandate signature was set aside.
       */
      linked?: "linked" | "takeover";
    }
  | { type: "created"; userId: string; kind: UserKind; locale: Locale }
  | { type: "pending" }
  | { type: "refused"; error: OAuthRefusal };

type Db = Pick<PrismaClient, "account" | "user" | "$transaction">;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function findAccountUser(db: Db, identity: OAuthIdentity) {
  const account = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
      },
    },
    include: { user: true },
  });
  return account?.user ?? null;
}

export async function resolveOAuthUser(
  db: Db,
  identity: OAuthIdentity | null,
  intent: OAuthIntent | null,
  now: Date = new Date()
): Promise<ResolveResult> {
  if (!identity?.email) return { type: "refused", error: "oauthEmailUnverified" };

  const linked = await findAccountUser(db, identity);
  if (linked) {
    return {
      type: "signedIn",
      userId: linked.id,
      kind: linked.kind,
      locale: linked.locale,
    };
  }

  const sameEmail = await findUsersByEmail(db, identity.email);
  if (sameEmail.length > 1 || (sameEmail.length === 1 && !identity.emailAuthoritative)) {
    return { type: "refused", error: "oauthLinkRequiresPassword" };
  }
  if (sameEmail.length === 1) {
    return linkOAuthUser(db, identity, sameEmail[0].id, now);
  }

  if (intent?.mode !== "signup" || !intent.kind) return { type: "pending" };

  return createOAuthUser(db, identity, intent.kind, intent.locale, now);
}

/**
 * Create the User, its Account and the signup audit entry in one transaction.
 * No provider tokens are stored: sign-in needs only the subject, and a token
 * at rest is one more secret to leak.
 */
export async function createOAuthUser(
  db: Db,
  identity: OAuthIdentity,
  kind: UserKind,
  locale: Locale,
  now: Date = new Date()
): Promise<ResolveResult> {
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: identity.email,
          name: identity.name,
          image: identity.image,
          kind,
          locale,
          emailVerified: now,
          passwordHash: null,
          accounts: {
            create: {
              type: "oidc",
              provider: identity.provider,
              providerAccountId: identity.providerAccountId,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: created.id,
          organizationId: null,
          action: "user.signup",
          resourceType: "User",
          resourceId: created.id,
          before: JSON.stringify({}),
          after: JSON.stringify({ kind, method: identity.provider }),
        },
      });
      return created;
    });
    return { type: "created", userId: user.id, kind, locale };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Lost a race: a double submit created this account a moment ago, or an
    // email signup took the address in between. Settle on what is there now.
    const linked = await findAccountUser(db, identity);
    if (linked) {
      return {
        type: "signedIn",
        userId: linked.id,
        kind: linked.kind,
        locale: linked.locale,
      };
    }
    return { type: "refused", error: "oauthLinkRequiresPassword" };
  }
}

/**
 * Join a provider identity to the existing account that has its email.
 *
 * The provider proves who owns the mailbox now. It cannot prove who created
 * the account. Email and password sign-up never verified the address, so
 * anyone could have registered someone else's email in advance, set a
 * password, signed a mandate in their name, and waited for the real owner to
 * arrive with Google or Apple. Joining such an account as it stands would
 * hand that person a way in.
 *
 * So, unless another provider already proved this email for the account:
 *   - the password is removed (the owner signs in with the provider from now
 *     on, or sets a new password through a reset once that exists);
 *   - every session issued before this moment is refused (sessionsValidAfter,
 *     enforced in src/auth.ts);
 *   - an active mandate is revoked, so the owner signs it themselves.
 * When the email was already proven, the identity is simply added.
 *
 * Everything happens in one transaction and is audited.
 */
export async function linkOAuthUser(
  db: Db,
  identity: OAuthIdentity,
  userId: string,
  now: Date = new Date()
): Promise<ResolveResult> {
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          kind: true,
          locale: true,
          name: true,
          image: true,
          emailVerified: true,
          passwordHash: true,
          _count: { select: { accounts: true } },
        },
      });
      if (!user) return { type: "refused", error: "oauthGeneric" } as const;

      const proven = user._count.accounts > 0;
      const takeover = !proven && user.passwordHash !== null;

      await tx.account.create({
        data: {
          userId: user.id,
          type: "oidc",
          provider: identity.provider,
          providerAccountId: identity.providerAccountId,
        },
      });

      let mandatesRevoked = 0;
      if (takeover) {
        const revoked = await tx.mandat.updateMany({
          where: { profile: { userId: user.id }, status: "ACTIVE" },
          data: { status: "REVOKED", revokedAt: now },
        });
        mandatesRevoked = revoked.count;
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: user.emailVerified ?? now,
          name: user.name ?? identity.name,
          image: user.image ?? identity.image,
          ...(takeover ? { passwordHash: null, sessionsValidAfter: now } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          organizationId: null,
          action: takeover ? "auth.oauth.link_takeover" : "auth.oauth.link",
          resourceType: "User",
          resourceId: user.id,
          before: JSON.stringify({ hadPassword: user.passwordHash !== null, proven }),
          after: JSON.stringify({
            provider: identity.provider,
            passwordRemoved: takeover,
            mandatesRevoked,
          }),
        },
      });

      return {
        type: "signedIn",
        userId: user.id,
        kind: user.kind,
        locale: user.locale,
        linked: takeover ? "takeover" : "linked",
      } as const;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A double submit linked this identity a moment ago.
    const linked = await findAccountUser(db, identity);
    if (linked && linked.id === userId) {
      return { type: "signedIn", userId: linked.id, kind: linked.kind, locale: linked.locale };
    }
    return { type: "refused", error: "oauthLinkRequiresPassword" };
  }
}
