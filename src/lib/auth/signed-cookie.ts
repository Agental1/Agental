/**
 * Short-lived, HMAC-signed cookie values for the OAuth flow.
 *
 * Two values cross a provider round trip and must come back untouched:
 *
 * - `oauth-intent`: what the person asked for before leaving for Google or
 *   Apple (sign in or sign up, which portal, which language).
 * - `pending-oauth`: a verified provider identity with no Agental account yet,
 *   held for the ten minutes it takes to pick talent or casting director.
 *
 * Both are httpOnly, but httpOnly only stops scripts. A visitor can still edit
 * a cookie by hand, so the value is signed and the signature checked before
 * anything is trusted. The key is derived from AUTH_SECRET with HKDF and a
 * per-use label, so a value signed for one purpose never verifies for another,
 * and the session secret itself is never used as an HMAC key directly.
 *
 * Plain WebCrypto, no Node imports: the module runs unchanged in route
 * handlers, server actions and Vitest.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Every cookie value here expires after ten minutes. */
export const SIGNED_COOKIE_TTL_SECONDS = 600;

/** One label per use. A new use gets a new label, never a shared one. */
export type SignedCookieLabel = "oauth-intent" | "pending-oauth";

const HKDF_SALT = encoder.encode("agental.signed-cookie.v1");

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string, label: SignedCookieLabel): Promise<CryptoKey> {
  const cacheKey = `${label}\u0000${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = (async () => {
      const base = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        "HKDF",
        false,
        ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: HKDF_SALT,
          info: encoder.encode(`agental:${label}`),
        },
        base,
        { name: "HMAC", hash: "SHA-256", length: 256 },
        false,
        ["sign"]
      );
    })();
    keyCache.set(cacheKey, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Compares every byte whatever the first mismatch, so timing says nothing. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function signature(
  secret: string,
  label: SignedCookieLabel,
  body: string
): Promise<Uint8Array> {
  const key = await hmacKey(secret, label);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  );
}

function resolveSecret(secret: string | undefined): string | undefined {
  const value = secret ?? process.env.AUTH_SECRET;
  return value ? value : undefined;
}

export interface SignOptions {
  /** Defaults to process.env.AUTH_SECRET. */
  secret?: string;
  /** Milliseconds since the epoch. Tests pin it. */
  now?: number;
  ttlSeconds?: number;
}

/**
 * Sign a JSON payload as `base64url(payload).base64url(hmac)`. An `exp` claim
 * (seconds) is added; a payload key named `exp` is overwritten.
 */
export async function signCookieValue(
  label: SignedCookieLabel,
  payload: Record<string, unknown>,
  options: SignOptions = {}
): Promise<string> {
  const secret = resolveSecret(options.secret);
  if (!secret) throw new Error("AUTH_SECRET is not set; cannot sign a cookie.");
  const now = options.now ?? Date.now();
  const exp =
    Math.floor(now / 1000) + (options.ttlSeconds ?? SIGNED_COOKIE_TTL_SECONDS);
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp })));
  const sig = await signature(secret, label, body);
  return `${body}.${toBase64Url(sig)}`;
}

/**
 * Verify a value produced by signCookieValue for the same label. Returns the
 * payload without `exp`, or null when the value is malformed, tampered with,
 * signed for another label or expired. Callers still validate the shape.
 */
export async function verifyCookieValue(
  label: SignedCookieLabel,
  value: string | undefined | null,
  options: Omit<SignOptions, "ttlSeconds"> = {}
): Promise<Record<string, unknown> | null> {
  if (!value) return null;
  const secret = resolveSecret(options.secret);
  if (!secret) return null;

  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, sigText] = parts;
  const given = fromBase64Url(sigText);
  if (!body || !given) return null;

  const expected = await signature(secret, label, body);
  if (!timingSafeEqual(given, expected)) return null;

  const raw = fromBase64Url(body);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const { exp, ...payload } = parsed as Record<string, unknown>;
  const now = options.now ?? Date.now();
  if (typeof exp !== "number" || exp * 1000 <= now) return null;
  return payload;
}

/**
 * Cookie name and attributes, by transport.
 *
 * On https the cookie must survive Apple's cross-site form_post callback, which
 * takes SameSite=None, which browsers accept only with Secure. The __Secure-
 * prefix makes the browser refuse the name from any insecure origin.
 *
 * On http (local development) SameSite=None without Secure is rejected by
 * every current browser, so the cookie falls back to Lax. Lax covers Google,
 * whose callback is a top-level GET. Apple cannot run on http anyway.
 */
export function signedCookieName(base: string, secure: boolean): string {
  return secure ? `__Secure-agental.${base}` : `agental.${base}`;
}

export function signedCookieOptions(secure: boolean, path = "/") {
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    path,
    maxAge: SIGNED_COOKIE_TTL_SECONDS,
  };
}
