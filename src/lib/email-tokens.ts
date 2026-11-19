import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { toLocale } from "@/i18n/routing";

/**
 * Single-use links sent by email: confirm an address, reset a password.
 *
 * A token is 32 bytes from the system CSPRNG, written in base64url. It exists
 * in two places only: the email and the link the person clicks. The table
 * keeps its SHA-256, so a database dump holds nothing that works as a link.
 * A plain hash is enough here, unlike the six-digit student codes: 256 random
 * bits cannot be guessed back from their hash.
 *
 * Rows live in VerificationToken, the Auth.js table this app had never used.
 * `identifier` is "<purpose>:<userId>" and `token` is the hash. Creating a
 * token deletes the earlier ones of the same identifier, so one link works at
 * a time and the newest email always wins.
 *
 * The table is unique on (identifier, token) and has no index on `token`
 * alone, so the lookup by hash scans it. It holds two rows per user at most.
 *
 * The database client is a parameter so the rules are tested against a mock,
 * and so a transaction client can be passed in.
 */

export type EmailTokenPurpose = "verify" | "reset";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * The page behind each link, as the path segment after the locale:
 * /[locale]/verifier and /[locale]/reinitialiser. The pages read `token` from
 * the query string.
 */
export const VERIFY_PATH_SEGMENT = "verifier";
export const RESET_PATH_SEGMENT = "reinitialiser";
export const TOKEN_QUERY_PARAM = "token";

const TOKEN_BYTES = 32;
// 32 bytes in base64url, unpadded: always 43 characters of this alphabet.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type EmailTokenDb = Pick<PrismaClient, "verificationToken">;

function identifierFor(purpose: EmailTokenPurpose, userId: string): string {
  return `${purpose}:${userId}`;
}

/** SHA-256 of a token, in hex. The only form of it the database sees. */
export function hashEmailToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateEmailTokenInput {
  purpose: EmailTokenPurpose;
  userId: string;
  /** How long the link works, in milliseconds. */
  ttlMs: number;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
}

/**
 * Create a token and return it in the clear, once. Earlier tokens of the same
 * purpose and user stop working first.
 */
export async function createEmailToken(
  db: EmailTokenDb,
  input: CreateEmailTokenInput
): Promise<string> {
  if (!input.userId) throw new Error("createEmailToken needs a user id.");
  if (!(input.ttlMs > 0)) throw new Error("createEmailToken needs a positive ttlMs.");
  const now = input.now ?? new Date();
  const identifier = identifierFor(input.purpose, input.userId);
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({
    data: {
      identifier,
      token: hashEmailToken(token),
      expires: new Date(now.getTime() + input.ttlMs),
    },
  });
  return token;
}

/** Delete every pending token of one purpose for one user. */
export async function revokeEmailTokens(
  db: EmailTokenDb,
  input: { purpose: EmailTokenPurpose; userId: string }
): Promise<void> {
  await db.verificationToken.deleteMany({
    where: { identifier: identifierFor(input.purpose, input.userId) },
  });
}

export type ConsumeEmailTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" };

export interface ConsumeEmailTokenInput {
  purpose: EmailTokenPurpose;
  /** Whatever the client sent. Checked here, never trusted. */
  token: unknown;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
}

/**
 * Use a token up.
 *
 * 1. Anything that cannot be a token is invalid before a query runs.
 * 2. Unknown hash, or a token issued for the other purpose: invalid. A
 *    confirmation link is worth nothing on the reset page, and it is left in
 *    place for the page it belongs to.
 * 3. The row is deleted, valid or expired. The delete is the claim: of two
 *    requests carrying the same token, one deletes a row and the other
 *    deletes none, and deleting none is answered as invalid.
 * 4. Expired: expired. Otherwise the user id the token was issued for.
 */
export async function consumeEmailToken(
  db: EmailTokenDb,
  input: ConsumeEmailTokenInput
): Promise<ConsumeEmailTokenResult> {
  const { purpose, token } = input;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "invalid" };
  }
  const now = input.now ?? new Date();
  const hash = hashEmailToken(token);
  const prefix = `${purpose}:`;

  const row = await db.verificationToken.findFirst({
    where: { token: hash },
    select: { identifier: true, expires: true },
  });
  if (!row || !row.identifier.startsWith(prefix)) {
    return { ok: false, reason: "invalid" };
  }

  const claimed = await db.verificationToken.deleteMany({
    where: { identifier: row.identifier, token: hash },
  });
  if (claimed.count === 0) return { ok: false, reason: "invalid" };

  if (row.expires.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  const userId = row.identifier.slice(prefix.length);
  if (!userId) return { ok: false, reason: "invalid" };
  return { ok: true, userId };
}

/**
 * The link placed in the email. The locale falls back to the default one, and
 * the token is URL-encoded although its alphabet needs no encoding.
 */
export function linkFor(
  purpose: EmailTokenPurpose,
  token: string,
  locale: string,
  baseUrl: string
): string {
  const segment = purpose === "verify" ? VERIFY_PATH_SEGMENT : RESET_PATH_SEGMENT;
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${toLocale(locale)}/${segment}?${TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`;
}

export type SiteUrlEnv = Record<string, string | undefined>;

/** The part of a Headers object this module reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const LOCAL_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

function configuredOrigin(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not an absolute URL; email links cannot be built from it.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must start with http:// or https://.`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * Where the site answers, with no trailing slash, for building email links.
 *
 * NEXT_PUBLIC_SITE_URL comes first, then AUTH_URL. With neither, the origin is
 * read from the request: `x-forwarded-proto` and `host`. That last resort
 * serves previews and local runs, where the platform or the developer sets
 * the host. Production sets one of the two variables (AUTH_URL already is,
 * see docs/OAUTH_SETUP.md), so a production link never depends on a header a
 * client could have written.
 *
 * Throws when a variable is set to something that is not a URL, and when
 * nothing at all is available: a link to nowhere must never be emailed.
 */
export function siteBaseUrl(
  env: SiteUrlEnv,
  headers?: HeaderReader | null
): string {
  for (const name of ["NEXT_PUBLIC_SITE_URL", "AUTH_URL"]) {
    const value = (env[name] ?? "").trim();
    if (value) return configuredOrigin(name, value);
  }

  const host = (headers?.get("host") ?? "").trim();
  if (host && HOST_PATTERN.test(host)) {
    const forwarded = (headers?.get("x-forwarded-proto") ?? "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    const proto =
      forwarded === "https" || forwarded === "http"
        ? forwarded
        : LOCAL_HOST_PATTERN.test(host)
          ? "http"
          : "https";
    return `${proto}://${host}`;
  }

  throw new Error(
    "The site URL is unknown: set NEXT_PUBLIC_SITE_URL or AUTH_URL so email links can be built."
  );
}
