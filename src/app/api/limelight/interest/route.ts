import { recordInterest } from "@/lib/limelight/leads";
import { scheduleOutboxDrain } from "@/lib/limelight/after-response";
import { clientAddressKey, readJsonBody } from "@/lib/limelight/request";

/**
 * POST /api/limelight/interest: "Request a portfolio site".
 *
 * Body (JSON): { name, email, performerType?, portfolioUrl?, need?,
 * contactPref?, phone?, marketingOptIn?, consentVersion, source, locale?,
 * company? }. See `parseLimelightInterest`.
 *
 * Answers:
 * - 201 { ok: true, reference }: the request is stored. Never sent earlier.
 * - 400 { ok: false, fieldErrors }: one error key per field. When the body
 *   itself is unusable (wrong content type, over 8 KB, not a JSON object)
 *   `fieldErrors` is empty and `error` is "errors.invalidInput".
 * - 429 { ok: false, error: "errors.limelightTooMany" }, with Retry-After.
 * - 500 { ok: false, error: "errors.limelightSendFailed" }: nothing was
 *   stored and the same request can be sent again.
 *
 * Cross-site posts: this route reads no cookie and no session, so a request
 * forged from another site gains nothing a direct request would not. It
 * accepts application/json only, which a cross-site HTML form cannot send
 * and a cross-site fetch may send only after a preflight this app never
 * approves (no CORS headers are set). What remains is scripted abuse, which
 * the honeypot and the two rate limits bound.
 */

const MAX_BODY_BYTES = 8 * 1024;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(req: Request) {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  if (
    !body.ok ||
    typeof body.value !== "object" ||
    body.value === null ||
    Array.isArray(body.value)
  ) {
    return json(400, { ok: false, error: "errors.invalidInput", fieldErrors: {} });
  }

  const result = await recordInterest(body.value, {
    clientKey: clientAddressKey(req.headers),
  });

  if (result.ok) {
    // The lead and its alert row are committed. Sending the alert happens
    // after the response and cannot change it.
    if (result.created) scheduleOutboxDrain();
    return json(201, { ok: true, reference: result.reference });
  }
  if (result.reason === "invalid") {
    return json(400, { ok: false, fieldErrors: result.fieldErrors });
  }
  if (result.reason === "rate_limited") {
    return json(
      429,
      { ok: false, error: "errors.limelightTooMany" },
      { "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) }
    );
  }
  return json(500, { ok: false, error: "errors.limelightSendFailed" });
}
