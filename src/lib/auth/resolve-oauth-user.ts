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
 * 2. A User already has this email, in any letter case: refuse. In V1 a
 *    provider identity never attaches itself to an existing account, password
 *    or not, because nothing in this app proves who registered that email
 *    first. Linking from settings, while signed in, is the planned way in.
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
  | { type: "signedIn"; userId: string; kind: string; locale: string }
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
  if (sameEmail.length > 0) {
    return { type: "refused", error: "oauthLinkRequiresPassword" };
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
