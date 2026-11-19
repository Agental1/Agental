import { SignJWT, importPKCS8 } from "jose";

/**
 * Which OAuth providers this deployment offers, decided from the environment.
 *
 * Every provider is optional. A build or a test run with no OAuth variables
 * gets Credentials only and no buttons, instead of a provider that fails at the
 * first click with a missing client id.
 */

export const OAUTH_PROVIDER_IDS = ["google", "apple"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

type Env = Record<string, string | undefined>;

function has(env: Env, name: string): boolean {
  return typeof env[name] === "string" && env[name]!.trim() !== "";
}

/** Apple accepts a pasted client secret, or the parts to sign one at runtime. */
export function appleSecretMode(env: Env): "static" | "signed" | null {
  if (!has(env, "AUTH_APPLE_ID")) return null;
  if (has(env, "AUTH_APPLE_SECRET")) return "static";
  if (
    has(env, "AUTH_APPLE_TEAM_ID") &&
    has(env, "AUTH_APPLE_KEY_ID") &&
    has(env, "AUTH_APPLE_PRIVATE_KEY")
  ) {
    return "signed";
  }
  return null;
}

export function oauthProvidersFromEnv(env: Env): OAuthProviderId[] {
  const enabled: OAuthProviderId[] = [];
  if (has(env, "AUTH_GOOGLE_ID") && has(env, "AUTH_GOOGLE_SECRET")) {
    enabled.push("google");
  }
  if (appleSecretMode(env)) enabled.push("apple");
  return enabled;
}

export function isOAuthProviderId(value: unknown): value is OAuthProviderId {
  return (
    typeof value === "string" &&
    (OAUTH_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

// ─────────────────────────── Apple client secret ────────────────────────────

/** Apple allows up to six months; one day keeps a leaked secret short-lived. */
const APPLE_SECRET_LIFETIME_SECONDS = 24 * 60 * 60;
/** Re-sign an hour before expiry so a request never carries a stale secret. */
const APPLE_SECRET_REFRESH_MS = 23 * 60 * 60 * 1000;

let appleSecretCache: { value: string; refreshAt: number } | null = null;

/** Test hook: forget the cached secret. */
export function resetAppleSecretCache(): void {
  appleSecretCache = null;
}

/**
 * Apple's client secret is an ES256 JWT signed with the team's .p8 key. Signing
 * it here means nobody has to paste a new one every few months. The config is
 * built on every auth() call, so the signed value is cached in module scope and
 * re-signed only when it nears expiry.
 *
 * AUTH_APPLE_PRIVATE_KEY may hold real newlines or literal "\n" sequences, the
 * form most hosting dashboards store a multi-line value in.
 */
export async function appleClientSecret(
  env: Env,
  now: number = Date.now()
): Promise<string> {
  if (has(env, "AUTH_APPLE_SECRET")) return env.AUTH_APPLE_SECRET!;
  if (appleSecretCache && now < appleSecretCache.refreshAt) {
    return appleSecretCache.value;
  }
  const pem = env.AUTH_APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n").trim();
  const key = await importPKCS8(pem, "ES256");
  const iat = Math.floor(now / 1000);
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.AUTH_APPLE_KEY_ID! })
    .setIssuer(env.AUTH_APPLE_TEAM_ID!)
    .setSubject(env.AUTH_APPLE_ID!)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(iat)
    .setExpirationTime(iat + APPLE_SECRET_LIFETIME_SECONDS)
    .sign(key);
  appleSecretCache = { value, refreshAt: now + APPLE_SECRET_REFRESH_MS };
  return value;
}
