import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import { allowedSources, IntakeBody, issuePaths } from "@/domain/workflow/brief";
import {
  INTAKE_RATE_WINDOW_MS,
  MAX_BODY_BYTES,
  resolveLimits,
} from "@/domain/workflow/limits";
import { sha256Hex } from "@/domain/workflow/normalize";
import { signingSecret } from "@/lib/workflow/config";
import { redactError, runBriefIntake } from "@/lib/workflow/intake";
import { getFitModel, type FitModel } from "@/lib/workflow/model";
import {
  checkSignatureHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "@/lib/workflow/signature";

/**
 * Intake of opportunity briefs for the dry-run workflow.
 *
 *   POST /api/workflow/briefs
 *   x-agental-timestamp: <unix seconds>
 *   x-agental-signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
 *   idempotency-key: <optional, a name for this request>
 *
 *   { "source": "manual", "briefs": [ ... ], "profileIds": ["..."] }
 *
 * The route answers 404 unless WORKFLOW_SIGNING_SECRET is set. It stores the
 * briefs, assesses them for the pilot profiles and creates draft rows. It
 * sends nothing anywhere: no email, no submission, no call to the source.
 *
 * Request format, limits and a worked example: docs/WORKFLOWS.md.
 */

// Up to 50 briefs for several profiles, one after the other.
export const maxDuration = 60;

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:~-]{1,200}$/;

function json(payload: unknown, status: number, headers?: Record<string, string>) {
  return Response.json(payload, { status, headers });
}

/** One answer for every failed authentication, whatever the cause. */
function unauthorized() {
  return json({ error: "unauthorized" }, 401);
}

/** The raw body, or null when it is larger than `cap` bytes. */
async function readBody(req: Request, cap: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(req: Request) {
  const secret = signingSecret();
  if (!secret) return new Response("Not found", { status: 404 });

  const now = new Date();
  const timestamp = req.headers.get(TIMESTAMP_HEADER);
  const signature = req.headers.get(SIGNATURE_HEADER);
  // Cheap checks first, so an unsigned request costs no body read.
  if (checkSignatureHeaders(timestamp, signature, now) !== "ok") return unauthorized();

  const rawBody = await readBody(req, MAX_BODY_BYTES);
  if (!rawBody) return json({ error: "payload_too_large" }, 413);
  if (verifySignature({ secret, timestamp, signature, rawBody, now }) !== "ok") {
    return unauthorized();
  }

  // From here on the caller holds the secret. The body is still untrusted data.
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const envelope = IntakeBody.safeParse(parsed);
  if (!envelope.success) {
    return json({ error: "invalid_request", issues: issuePaths(envelope.error) }, 400);
  }
  const { source, briefs, profileIds } = envelope.data;

  if (!allowedSources(process.env.WORKFLOW_ALLOWED_SOURCES).includes(source)) {
    return json({ error: "source_not_allowed" }, 403);
  }
  const limits = resolveLimits(process.env);
  if (briefs.length > limits.maxBriefsPerRequest) {
    return json({ error: "too_many_briefs", max: limits.maxBriefsPerRequest }, 400);
  }

  const headerKey = req.headers.get("idempotency-key");
  if (headerKey !== null && !IDEMPOTENCY_KEY.test(headerKey)) {
    return json({ error: "invalid_idempotency_key" }, 400);
  }
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const idempotencyKey =
    headerKey !== null
      ? `intake:key:${sha256Hex(`${source}\n${headerKey}`)}`
      : `intake:body:${bodyHash}`;

  try {
    const rate = await hitRateLimit(prisma, `workflow-intake:${source}`, {
      limit: limits.maxRequestsPerHour,
      windowMs: INTAKE_RATE_WINDOW_MS,
      now,
    });
    if (!rate.allowed) {
      return json({ error: "rate_limited" }, 429, {
        "Retry-After": String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))),
      });
    }

    let model: FitModel | null;
    try {
      model = await getFitModel();
    } catch {
      // Switched on without its key: a deployment error, said plainly.
      console.error("[workflow] model step is enabled but not configured");
      return json({ error: "model_unavailable" }, 503);
    }

    const outcome = await runBriefIntake(
      { source, briefs, profileIds, idempotencyKey, bodyHash },
      { db: prisma, model }
    );
    switch (outcome.kind) {
      case "done":
        return json(outcome.body, 200);
      case "failed":
        return json({ error: "run_failed", retryable: true, ...outcome.body }, 503, {
          "Retry-After": "30",
        });
      case "dead":
        return json({ error: "run_dead", retryable: false, ...outcome.body }, 500);
      case "busy":
        return json({ error: "run_in_progress", runId: outcome.runId }, 409, {
          "Retry-After": "30",
        });
      case "mismatch":
        return json({ error: "idempotency_key_reused" }, 409);
    }
  } catch (error) {
    console.error(`[workflow] intake failed ${redactError("intake", error)}`);
    return json({ error: "internal_error" }, 500);
  }
}
