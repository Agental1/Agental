import { prisma } from "@/lib/db";
import {
  isOAuthProviderId,
  OAUTH_PROVIDER_IDS,
  type OAuthProviderId,
} from "@/lib/auth/oauth-providers";

/**
 * The sign-in methods of one account, for the Settings screen "Connected
 * accounts".
 *
 * Server-only: call it from a server component or a server action with the
 * signed-in user's own id. Who is asking is the caller's check.
 *
 * What leaves this module is the provider's name, two dates and a yes or no
 * about the password. The provider's subject id, the token columns and the
 * password hash are never selected or returned.
 */

export interface ConnectedAccount {
  provider: OAuthProviderId;
  /** When the provider joined the account. Null for old connections. */
  connectedAt: Date | null;
  /** The last sign-in with this provider. Null when not recorded yet. */
  lastUsedAt: Date | null;
  /** Whether the account also has a password. The same on every row. */
  hasPassword: boolean;
}

export interface LoginMethods {
  hasPassword: boolean;
  /** Distinct provider names with a connection, in a stable order. */
  providers: string[];
}

type AccountRow = { provider: string; createdAt: Date | null; lastUsedAt: Date | null };

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a.getTime() <= b.getTime() ? a : b;
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a || !b) return a ?? b;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Does this user have a password? False for an unknown user. */
async function hasPasswordFor(userId: string): Promise<boolean> {
  const withPassword = await prisma.user.count({
    where: { id: userId, passwordHash: { not: null } },
  });
  return withPassword > 0;
}

/**
 * Can this provider be disconnected? Shared by the screen (to grey out the
 * button) and by disconnectProvider (which decides again inside its
 * transaction).
 *
 * - "notConnected": there is no such connection.
 * - "lastMethod": it is the only way in. With no password and no other
 *   provider, removing it would lock the person out.
 * - "ok": a password or another provider remains.
 */
export function disconnectVerdict(
  methods: LoginMethods,
  provider: string
): "ok" | "notConnected" | "lastMethod" {
  if (!methods.providers.includes(provider)) return "notConnected";
  const others = methods.providers.filter((name) => name !== provider);
  if (!methods.hasPassword && others.length === 0) return "lastMethod";
  return "ok";
}

/**
 * Google and Apple connections of one user, one row per provider, Google
 * first. Empty when no provider is connected (use loginMethods then).
 */
export async function listConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const [rows, hasPassword] = await Promise.all([
    prisma.account.findMany({
      where: { userId, provider: { in: [...OAUTH_PROVIDER_IDS] } },
      select: { provider: true, createdAt: true, lastUsedAt: true },
    }) as Promise<AccountRow[]>,
    hasPasswordFor(userId),
  ]);

  const byProvider = new Map<OAuthProviderId, ConnectedAccount>();
  for (const row of rows) {
    if (!isOAuthProviderId(row.provider)) continue;
    const seen = byProvider.get(row.provider);
    byProvider.set(row.provider, {
      provider: row.provider,
      connectedAt: seen ? earliest(seen.connectedAt, row.createdAt) : row.createdAt,
      lastUsedAt: seen ? latest(seen.lastUsedAt, row.lastUsedAt) : row.lastUsedAt,
      hasPassword,
    });
  }
  return OAUTH_PROVIDER_IDS.flatMap((provider) => {
    const account = byProvider.get(provider);
    return account ? [account] : [];
  });
}

/**
 * Every way this user can sign in: a password or not, and which providers.
 * For the screen when no provider is connected, and for deciding whether a
 * provider may be disconnected.
 */
export async function loginMethods(userId: string): Promise<LoginMethods> {
  const [rows, hasPassword] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: { provider: true },
    }),
    hasPasswordFor(userId),
  ]);
  const providers = [...new Set(rows.map((row) => row.provider))].sort();
  return { hasPassword, providers };
}
