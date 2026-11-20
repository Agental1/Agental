import { createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { SHARE_LIST_LIMIT, shareIsActive } from "@/domain/share";

/**
 * Share links, server side: the token, its hash, the address the link opens,
 * the rate-limit key of whoever opens it, and the listing a talent sees.
 *
 * A token is 32 bytes from the system CSPRNG, written in base64url. It exists
 * in one place only: the link returned once by createShareLink. The table
 * keeps its SHA-256, so a database dump holds nothing that opens a clip, and
 * a link that was lost cannot be shown again, only replaced.
 */

export {
  clampShareHours,
  shareExpiry,
  shareIsActive,
  SHARE_DEFAULT_HOURS,
  SHARE_MAX_ACTIVE,
  SHARE_MAX_HOURS,
  SHARE_MIN_HOURS,
} from "@/domain/share";

const TOKEN_BYTES = 32;
// 32 bytes in base64url, unpadded: always 43 characters of this alphabet.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A new token, in the clear. Hand it to the person once; store its hash. */
export function newShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Could this value be a token at all? Checked before any query runs. */
export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** SHA-256 of a token, in hex. The only form of it the database sees. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The route a link opens: /api/share/<token>. */
export function sharePath(token: string): string {
  return `/api/share/${encodeURIComponent(token)}`;
}

/** The absolute link, from the site origin (see siteBaseUrl in email-tokens.ts). */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${sharePath(token)}`;
}

/** Opens allowed per client address in one minute, across all links. */
export const SHARE_VIEW_RATE = { limit: 60, windowMs: 60 * 1000 };

const RATE_KEY_SALT = "agental.share.v1";
const RATE_KEY_INFO = "agental:share-rate-limit-key";

/** The part of a Headers object this module reads. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * x-real-ip is set by the platform; the first x-forwarded-for hop is whatever
 * the client chose to send. Requests carrying neither share one "unknown"
 * bucket, so a missing header tightens the limit instead of lifting it.
 */
export function clientAddress(headers: HeaderReader): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * The rate-limit key for one client address: a keyed hash, so the
 * RateLimitEvent table never holds an IP address and a dump of it cannot be
 * reversed by trying every address. The key is derived from AUTH_SECRET with
 * a label of its own.
 */
export function shareRateKey(
  address: string,
  secret: string = process.env.AUTH_SECRET ?? ""
): string {
  const key = hkdfSync("sha256", secret, RATE_KEY_SALT, RATE_KEY_INFO, 32);
  const digest = createHmac("sha256", new Uint8Array(key)).update(address).digest("hex");
  return `share:view:${digest}`;
}

/**
 * Does this request start a viewing? A video player fetches a file in
 * pieces and may come back through the link for each piece. A request with
 * no Range header, or one that starts at the first byte, counts as a view;
 * a request for a later piece is the same viewing carrying on.
 */
export function startsViewing(range: string | null): boolean {
  if (!range) return true;
  const match = /^\s*bytes\s*=\s*(\d*)\s*-/i.exec(range);
  if (!match) return true;
  return match[1] === "" ? false : Number(match[1]) === 0;
}

/** One link as its owner sees it, without the token, its hash or the URL. */
export interface ShareLinkInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  /** Works right now: not revoked and not expired. */
  active: boolean;
}

const LINK_COLUMNS = {
  id: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastViewedAt: true,
} as const;

type LinkRow = Omit<ShareLinkInfo, "active">;

function toInfo(row: LinkRow, now: Date): ShareLinkInfo {
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt,
    active: shareIsActive(row, now),
  };
}

/**
 * The links made for one clip, newest first, revoked and expired ones
 * included (the 50 most recent).
 *
 * Server-only, for the signed-in talent's own clip. The session is the
 * caller's business: pass `profileId` (the caller's own profile) and a clip
 * that belongs to anyone else returns an empty list.
 */
export async function listShareLinks(
  mediaId: string,
  scope: { profileId?: string } = {},
  now: Date = new Date()
): Promise<ShareLinkInfo[]> {
  const rows = await prisma.mediaShare.findMany({
    where: {
      mediaId,
      ...(scope.profileId ? { media: { profileId: scope.profileId } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: SHARE_LIST_LIMIT,
    select: LINK_COLUMNS,
  });
  return rows.map((row) => toInfo(row, now));
}

/**
 * Every link of one profile in a single query, keyed by clip id, newest
 * first inside each list. For a page that shows many clips at once. A clip
 * with no link has no key.
 */
export async function listShareLinksByMedia(
  profileId: string,
  now: Date = new Date()
): Promise<Record<string, ShareLinkInfo[]>> {
  const rows = await prisma.mediaShare.findMany({
    where: { media: { profileId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { ...LINK_COLUMNS, mediaId: true },
  });
  const byMedia: Record<string, ShareLinkInfo[]> = {};
  for (const row of rows) {
    const list = (byMedia[row.mediaId] ??= []);
    if (list.length < SHARE_LIST_LIMIT) list.push(toInfo(row, now));
  }
  return byMedia;
}
