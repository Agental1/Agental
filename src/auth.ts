import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { LoginInput } from "@/domain/auth";
import { routing } from "@/i18n/routing";
import type { AuthErrorCode } from "@/domain/auth-errors";
import {
  appleClientSecret,
  appleSecretMode,
  isOAuthProviderId,
  oauthProvidersFromEnv,
  type OAuthProviderId,
} from "@/lib/auth/oauth-providers";
import { cleanName, identityFromProfile } from "@/lib/auth/oauth-identity";
import { resolveOAuthUser } from "@/lib/auth/resolve-oauth-user";
import { findUsersByEmail } from "@/lib/auth/user-by-email";
import {
  clearIntentCookie,
  readIntentCookie,
  writePendingCookie,
} from "@/lib/auth/oauth-cookies";

/**
 * Credentials plus optional Google and Apple, all on JWT sessions.
 *
 * There is no Prisma adapter. Users and accounts are created by our own code:
 * the signup server action for email and password, and
 * src/lib/auth/resolve-oauth-user.ts for providers. See that file for the
 * rules, including why a provider never attaches itself to an existing email.
 */

/**
 * Providers this deployment offers, from the environment, computed once at
 * module load. The buttons read it, and oauthSignInAction refuses anything
 * outside it.
 */
export const enabledOAuthProviders: readonly OAuthProviderId[] =
  oauthProvidersFromEnv(process.env);

const isProduction = process.env.NODE_ENV === "production";

async function buildProviders(): Promise<NextAuthConfig["providers"]> {
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = LoginInput.safeParse(raw);
        if (!parsed.success) return null;
        // Until every stored email is lowercase, two rows can answer to the
        // same address (see findUsersByEmail). The password tells whose
        // account this is.
        for (const user of await findUsersByEmail(prisma, parsed.data.email)) {
          if (!user.passwordHash) continue;
          if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
            continue;
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            kind: user.kind,
            locale: user.locale,
          };
        }
        return null;
      },
    }),
  ];

  if (enabledOAuthProviders.includes("google")) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        // normalizeOAuth defaults to PKCE only and adds state solely for a
        // redirect proxy. Ask for both.
        checks: ["pkce", "state"],
        authorization: { params: { prompt: "select_account" } },
      })
    );
  }

  if (enabledOAuthProviders.includes("apple") && appleSecretMode(process.env)) {
    // A malformed key must not take every auth() call down with it: Apple is
    // left out and logged, and email and Google sign-in keep working.
    let clientSecret: string | null = null;
    try {
      clientSecret = await appleClientSecret(process.env);
    } catch (error) {
      console.error("[auth] Apple client secret could not be signed", error);
    }
    if (clientSecret) providers.push(
      Apple({
        clientId: process.env.AUTH_APPLE_ID,
        clientSecret,
        // The stock profile builds "undefined undefined" when the name is
        // missing and falls back to the email. Apple sends the name only on
        // first consent, as an unsigned form field: trimmed and capped.
        // Identity checks happen in the signIn callback.
        profile(p) {
          return {
            id: p.sub,
            email: p.email,
            name: cleanName(p.user?.name?.firstName, p.user?.name?.lastName),
            image: null,
          };
        },
      })
    );
  }

  return providers;
}

/**
 * When this session began, in milliseconds. `authAt` is ours and survives
 * token refreshes. Sessions older than that claim only have `iat`, which
 * Auth.js rewrites on refresh and rounds to the second; it is good enough for
 * them, since a cut-off always postdates their last refresh.
 */
function sessionStartedAt(token: { authAt?: unknown; iat?: unknown }): number {
  if (typeof token.authAt === "number") return token.authAt;
  return typeof token.iat === "number" ? token.iat * 1000 : 0;
}

function connexionError(locale: string, code: AuthErrorCode): string {
  return `/${locale}/connexion?error=${code}`;
}

export async function buildAuthConfig(): Promise<NextAuthConfig> {
  return {
    session: { strategy: "jwt" },
    trustHost: true,
    secret: process.env.AUTH_SECRET,
    // Both point at our page: without `error`, Configuration and callback
    // errors land on the unbranded English Auth.js page.
    pages: { signIn: "/connexion", error: "/connexion" },
    // Apple returns with a cross-site POST, which does not carry the default
    // SameSite=Lax callback-url cookie, so the person would land on "/".
    // Options deep-merge with the defaults (@auth/core lib/init.js), so the
    // name and httpOnly flag are kept. Production only: SameSite=None needs
    // Secure, and Secure needs https.
    ...(isProduction
      ? {
          cookies: {
            callbackUrl: { options: { sameSite: "none", secure: true } },
          } as NextAuthConfig["cookies"],
        }
      : {}),
    providers: await buildProviders(),
    callbacks: {
      async signIn({ account, profile }) {
        if (!account || account.type === "credentials") return true;
        if (!isOAuthProviderId(account.provider)) return false;

        const intent = await readIntentCookie();
        await clearIntentCookie();
        const locale = intent?.locale ?? routing.defaultLocale;

        const identity = identityFromProfile(
          account.provider,
          account.providerAccountId,
          profile as Record<string, unknown> | undefined
        );
        if (!identity) return connexionError(locale, "oauthEmailUnverified");

        try {
          const result = await resolveOAuthUser(prisma, identity, intent);
          switch (result.type) {
            case "signedIn":
            case "created":
              return true;
            case "pending":
              await writePendingCookie(identity);
              return `/${locale}/continuer?choose=1`;
            case "refused":
              return connexionError(locale, result.error);
          }
        } catch (error) {
          console.error("[auth] OAuth sign-in failed", error);
          return connexionError(locale, "oauthGeneric");
        }
      },

      async jwt({ token, user, account }) {
        if (account && (account.type === "oidc" || account.type === "oauth")) {
          // OAuth sign-in: `user` carries a random UUID from Auth.js, not our
          // id. Read the Account the signIn callback just found or created.
          // One query per sign-in, never per request. No Account, no session.
          const linked = await prisma.account.findUnique({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            include: { user: true },
          });
          if (!linked) return null;
          token.sub = linked.user.id;
          token.email = linked.user.email;
          token.name = linked.user.name;
          token.picture = linked.user.image;
          token.kind = linked.user.kind;
          token.locale = linked.user.locale;
          token.authAt = Date.now();
          return token;
        }
        if (user) {
          // Credentials sign-in.
          token.kind = user.kind;
          token.locale = user.locale;
          token.authAt = Date.now();
          return token;
        }
        // An ordinary request. One primary-key read decides whether this
        // session still stands: the account must exist, and the session must
        // not predate a cut-off (set when a provider sign-in took over an
        // account whose password was never proven, see linkOAuthUser).
        if (token.sub) {
          let account: { sessionsValidAfter: Date | null } | null;
          try {
            account = await prisma.user.findUnique({
              where: { id: token.sub },
              select: { sessionsValidAfter: true },
            });
          } catch (error) {
            // The database is unreachable. Keep the session as it is: every
            // page that shows or changes anything needs the database too and
            // will fail on its own, so nothing is exposed by not ending it here.
            console.error("[auth] session check skipped, database unreachable", error);
            return token;
          }
          if (!account) return null;
          if (
            account.sessionsValidAfter &&
            sessionStartedAt(token) < account.sessionsValidAfter.getTime()
          ) {
            return null;
          }
        }
        return token;
      },

      session({ session, token }) {
        if (session.user) {
          session.user.id = token.sub!;
          session.user.kind =
            typeof token.kind === "string" ? token.kind : undefined;
          session.user.locale =
            typeof token.locale === "string" ? token.locale : undefined;
        }
        return session;
      },
    },
  };
}

// The lazy form lets the Apple client secret be signed at runtime. The config
// is rebuilt on every auth() call; the signed secret is cached in
// src/lib/auth/oauth-providers.ts, so that costs no crypto per request.
export const { handlers, signIn, signOut, auth } = NextAuth(buildAuthConfig);
