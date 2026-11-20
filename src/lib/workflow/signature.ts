import { createHmac, timingSafeEqual } from "node:crypto";
import { SIGNATURE_TOLERANCE_SECONDS } from "@/domain/workflow/limits";

/**
 * Authentication of the intake route: a shared secret, never sent, proves
 * who built the request and that the body was not altered on the way.
 *
 *   x-agental-timestamp: <unix seconds>
 *   x-agental-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
 *
 * The timestamp is inside the signed text, so an old request cannot be given
 * a fresh one, and a request older or newer than five minutes is refused.
 * The comparison runs in constant time.
 */

export const TIMESTAMP_HEADER = "x-agental-timestamp";
export const SIGNATURE_HEADER = "x-agental-signature";

const TIMESTAMP = /^\d{1,12}$/;
const SIGNATURE = /^sha256=([0-9a-f]{64})$/;

function digest(secret: string, timestamp: string, rawBody: string | Uint8Array): Buffer {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest();
}

/** The value of the signature header for this body at this time. */
export function signBody(
  secret: string,
  timestamp: number | string,
  rawBody: string | Uint8Array
): string {
  return `sha256=${digest(secret, String(timestamp), rawBody).toString("hex")}`;
}

export type SignatureCheck = "ok" | "missing" | "malformed" | "stale" | "mismatch";

/**
 * Check the two headers on their own, before the body is read: both present,
 * both well formed, and the timestamp inside the tolerance.
 */
export function checkSignatureHeaders(
  timestamp: string | null,
  signature: string | null,
  now: Date,
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS
): SignatureCheck {
  if (!timestamp || !signature) return "missing";
  if (!TIMESTAMP.test(timestamp) || !SIGNATURE.test(signature)) return "malformed";
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  return skew > toleranceSeconds ? "stale" : "ok";
}

/** The full check: headers, freshness, then the signature itself. */
export function verifySignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string | Uint8Array;
  now: Date;
  toleranceSeconds?: number;
}): SignatureCheck {
  const headers = checkSignatureHeaders(
    input.timestamp,
    input.signature,
    input.now,
    input.toleranceSeconds
  );
  if (headers !== "ok") return headers;
  const given = Buffer.from(SIGNATURE.exec(input.signature!)![1], "hex");
  const expected = digest(input.secret, input.timestamp!, input.rawBody);
  // Both are 32 bytes: the pattern above fixes the length of what was given.
  return timingSafeEqual(given, expected) ? "ok" : "mismatch";
}
