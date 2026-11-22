import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Svix-signed webhook (Resend uses Svix). The signed content is
 * `${id}.${timestamp}.${body}`, HMAC-SHA256 with the secret after "whsec_"
 * (base64). The svix-signature header lists one or more "v1,<base64>" values.
 * The timestamp must be within 5 minutes, so a captured request cannot be
 * replayed later.
 */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SVIX_TOLERANCE_SECONDS) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/**
 * How far along an email is. A webhook update only moves forward, so a late,
 * retried or replayed event never undoes a later state (a bounce stays a bounce).
 */
export const STATUS_RANK: Record<string, number> = {
  queued: 0,
  logged: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  bounced: 4,
  complained: 4,
  failed: 4,
};

/** The statuses an event may replace: every one ranked strictly lower. */
export function replaceableBy(status: string): string[] {
  const rank = STATUS_RANK[status] ?? 0;
  return Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] < rank);
}

/** Resend event type to the log status. Anything else is ignored. */
export const RESEND_EVENT_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};
