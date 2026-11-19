import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Request plumbing shared by the Limelight routes and actions: the rate limit
 * keys, the JSON body reader with a size cap, and the bearer check of the
 * cron route.
 */

/** Anything with a `get(name)`: Next's ReadonlyHeaders or a Headers object. */
export interface HeaderReader {
  get(name: string): string | null;
}

const KEY_SALT = "agental:limelight";
const KEY_INFO = "limelight rate limit key v1";

/**
 * A keyed hash of `value` under `label`, for rate limit keys.
 *
 * RateLimitEvent rows are plain text, so neither a client address nor an
 * email address is ever written there. A bare SHA-256 of an IP address is
 * reversible by trying every address, hence HMAC with a key derived from
 * AUTH_SECRET under a label of its own.
 */
export function limelightKeyHash(
  label: string,
  value: string,
  secret: string = process.env.AUTH_SECRET ?? ""
): string {
  const key = hkdfSync("sha256", secret, KEY_SALT, KEY_INFO, 32);
  return createHmac("sha256", new Uint8Array(key))
    .update(`${label}\n${value}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * x-real-ip is set by the platform; the first x-forwarded-for hop is whatever
 * the client chose to send. Requests carrying neither share one "unknown"
 * bucket, so a missing header tightens the limit instead of lifting it.
 */
function clientAddress(headers: HeaderReader): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** The caller's address as a keyed hash. The address itself goes nowhere. */
export function clientAddressKey(headers: HeaderReader): string {
  return limelightKeyHash("addr", clientAddress(headers));
}

export type JsonBody = { ok: true; value: unknown } | { ok: false };

/**
 * Read a JSON request body of at most `maxBytes`.
 *
 * Refused, all with the same answer: a content type other than
 * application/json, a declared or actual size over the cap, bytes that are
 * not UTF-8 JSON. The stream is abandoned as soon as the cap is passed, so a
 * large body is never held in memory.
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number
): Promise<JsonBody> {
  const type = (req.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type !== "application/json") return { ok: false };

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  if (!req.body) return { ok: false };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * True when the request carries `Authorization: Bearer <secret>`. Both sides
 * are hashed first, so the comparison takes the same time whatever the
 * length or content of what was sent.
 */
export function bearerMatches(headers: HeaderReader, secret: string): boolean {
  const header = headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || secret.length === 0) return false;
  const digest = (value: string) =>
    createHmac("sha256", "agental:limelight:bearer").update(value).digest();
  return timingSafeEqual(digest(match[1].trim()), digest(secret));
}
