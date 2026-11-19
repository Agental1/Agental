import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signBody } from "@/lib/workflow/signature";

/**
 * The intake route up to the point where a run starts: switched off without
 * a secret, one constant answer for every failed authentication, the size
 * cap, the request schema, the source allowlist, and how a run's outcome
 * becomes a status code. The run itself is faked here. The real one is in
 * tests/api/workflow-flow.test.ts.
 */

const runBriefIntake = vi.fn();
const hitRateLimit = vi.fn();
const getFitModel = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit }));
vi.mock("@/lib/workflow/model", () => ({ getFitModel }));
vi.mock("@/lib/workflow/intake", async (original) => ({
  ...(await original<typeof import("@/lib/workflow/intake")>()),
  runBriefIntake,
}));

const { POST } = await import("@/app/api/workflow/briefs/route");

const secret = "route-test-secret-not-a-real-one";
const URL = "http://localhost/api/workflow/briefs";
const valid = { source: "manual", briefs: [{ title: "Night Shift" }] };
const ENV = [
  "WORKFLOW_SIGNING_SECRET",
  "WORKFLOW_ALLOWED_SOURCES",
  "WORKFLOW_MAX_BRIEFS_PER_REQUEST",
];

function signed(payload: unknown, over: { headers?: Record<string, string>; raw?: string } = {}) {
  const raw = over.raw ?? JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agental-timestamp": timestamp,
      "x-agental-signature": signBody(secret, timestamp, raw),
      ...over.headers,
    },
    body: raw,
  });
}

const summary = { briefs: { created: 1, duplicate: 0, invalid: 0, expired: 0 } };
const done = {
  kind: "done",
  body: { runId: "run_1", status: "SUCCEEDED", replayed: false, attempts: 1, briefs: [], summary },
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ENV) delete process.env[name];
  process.env.WORKFLOW_SIGNING_SECRET = secret;
  hitRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 });
  getFitModel.mockResolvedValue(null);
  runBriefIntake.mockResolvedValue(done);
});

afterEach(() => {
  for (const name of ENV) delete process.env[name];
});

describe("POST /api/workflow/briefs", () => {
  it("does not exist while WORKFLOW_SIGNING_SECRET is unset", async () => {
    delete process.env.WORKFLOW_SIGNING_SECRET;
    const response = await POST(signed(valid));
    expect(response.status).toBe(404);
    expect(runBriefIntake).not.toHaveBeenCalled();
    process.env.WORKFLOW_SIGNING_SECRET = "   ";
    expect((await POST(signed(valid))).status).toBe(404);
  });

  it("answers 401 with one constant body for every failed authentication", async () => {
    const raw = JSON.stringify(valid);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const request = (headers: Record<string, string>) =>
      new Request(URL, { method: "POST", headers, body: raw });
    const stale = String(nowSeconds - 301);
    const attempts = [
      request({}),
      request({ "x-agental-timestamp": String(nowSeconds) }),
      request({ "x-agental-signature": signBody(secret, nowSeconds, raw) }),
      request({ "x-agental-timestamp": "soon", "x-agental-signature": "sha256=zz" }),
      request({ "x-agental-timestamp": stale, "x-agental-signature": signBody(secret, stale, raw) }),
      request({
        "x-agental-timestamp": String(nowSeconds),
        "x-agental-signature": signBody("wrong-secret", nowSeconds, raw),
      }),
      request({
        "x-agental-timestamp": String(nowSeconds),
        "x-agental-signature": signBody(secret, nowSeconds, `${raw} `),
      }),
    ];
    const bodies = new Set<string>();
    for (const attempt of attempts) {
      const response = await POST(attempt);
      expect(response.status).toBe(401);
      bodies.add(await response.text());
    }
    expect([...bodies]).toEqual(['{"error":"unauthorized"}']);
    expect(runBriefIntake).not.toHaveBeenCalled();
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it("refuses a body over the size cap", async () => {
    const big = { source: "manual", briefs: [{ title: "x", description: "y".repeat(300_000) }] };
    const response = await POST(signed(big));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(runBriefIntake).not.toHaveBeenCalled();
  });

  it("refuses a signed body that is not JSON", async () => {
    const response = await POST(signed(null, { raw: "title=Night Shift" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("refuses a request that does not fit the schema, naming paths only", async () => {
    const secretText = "do-not-echo";
    const response = await POST(signed({ source: "manual", briefs: [], extra: secretText }));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe("invalid_request");
    expect(payload.issues).toEqual(expect.arrayContaining(["briefs"]));
    expect(JSON.stringify(payload)).not.toContain(secretText);
    const tooMany = { source: "manual", briefs: Array.from({ length: 51 }, () => ({ title: "x" })) };
    expect((await POST(signed(tooMany))).status).toBe(400);
  });

  it("refuses a source that is not on the allowlist", async () => {
    const response = await POST(signed({ ...valid, source: "partner-a" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "source_not_allowed" });
    expect(runBriefIntake).not.toHaveBeenCalled();

    process.env.WORKFLOW_ALLOWED_SOURCES = "partner-a";
    expect((await POST(signed({ ...valid, source: "partner-a" }))).status).toBe(200);
    expect((await POST(signed({ ...valid, source: "fixture" }))).status).toBe(200);
  });

  it("applies a lowered brief limit", async () => {
    process.env.WORKFLOW_MAX_BRIEFS_PER_REQUEST = "2";
    const three = { source: "manual", briefs: [{ title: "a" }, { title: "b" }, { title: "c" }] };
    const response = await POST(signed(three));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "too_many_briefs", max: 2 });
  });

  it("refuses a malformed idempotency key", async () => {
    const response = await POST(signed(valid, { headers: { "idempotency-key": "has spaces" } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_idempotency_key" });
  });

  it("answers 429 with Retry-After when the source is over its hourly limit", async () => {
    hitRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 90_500 });
    const response = await POST(signed(valid));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("91");
    expect(hitRateLimit.mock.calls[0][1]).toBe("workflow-intake:manual");
    expect(runBriefIntake).not.toHaveBeenCalled();
  });

  it("answers 503 when the model step is switched on without its key", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    getFitModel.mockRejectedValue(new Error("WORKFLOW_MODEL_ENABLED requires ANTHROPIC_API_KEY"));
    const response = await POST(signed(valid));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "model_unavailable" });
    expect(runBriefIntake).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("hands a valid request to the run engine, keyed by its body", async () => {
    const response = await POST(signed({ ...valid, profileIds: ["p1"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(done.body);
    const [input, deps] = runBriefIntake.mock.calls[0];
    expect(input).toMatchObject({ source: "manual", briefs: valid.briefs, profileIds: ["p1"] });
    expect(input.idempotencyKey).toMatch(/^intake:body:[0-9a-f]{64}$/);
    expect(input.idempotencyKey).toBe(`intake:body:${input.bodyHash}`);
    expect(deps.model).toBeNull();

    // The same body signed again a moment later is the same request.
    await POST(signed({ ...valid, profileIds: ["p1"] }));
    expect(runBriefIntake.mock.calls[1][0].idempotencyKey).toBe(input.idempotencyKey);
    // Another body is another request.
    await POST(signed(valid));
    expect(runBriefIntake.mock.calls[2][0].idempotencyKey).not.toBe(input.idempotencyKey);
  });

  it("uses the Idempotency-Key header when one is sent, without storing it as is", async () => {
    await POST(signed(valid, { headers: { "idempotency-key": "batch-2026-11-19" } }));
    await POST(signed({ ...valid, profileIds: ["p1"] }, { headers: { "idempotency-key": "batch-2026-11-19" } }));
    const [first, second] = runBriefIntake.mock.calls.map((call) => call[0]);
    expect(first.idempotencyKey).toMatch(/^intake:key:[0-9a-f]{64}$/);
    expect(first.idempotencyKey).not.toContain("batch");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(second.bodyHash).not.toBe(first.bodyHash);
  });

  it("maps each run outcome to a status code", async () => {
    const body = { ...done.body };
    const cases: Array<[unknown, number, string | null]> = [
      [{ kind: "failed", body: { ...body, status: "FAILED" } }, 503, "run_failed"],
      [{ kind: "dead", body: { ...body, status: "DEAD" } }, 500, "run_dead"],
      [{ kind: "busy", runId: "run_1" }, 409, "run_in_progress"],
      [{ kind: "mismatch" }, 409, "idempotency_key_reused"],
    ];
    for (const [outcome, status, error] of cases) {
      runBriefIntake.mockResolvedValueOnce(outcome);
      const response = await POST(signed(valid));
      expect(response.status).toBe(status);
      expect((await response.json()).error).toBe(error);
    }
    runBriefIntake.mockResolvedValueOnce({ kind: "failed", body: { ...body, status: "FAILED" } });
    const failed = await POST(signed(valid));
    expect(failed.headers.get("retry-after")).toBe("30");
    expect(await failed.json()).toMatchObject({ retryable: true, runId: "run_1", status: "FAILED" });
  });

  it("answers 500 with no detail when the engine throws, and logs no message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    runBriefIntake.mockRejectedValue(new Error("connection to db at secret-host failed for Night Shift"));
    const response = await POST(signed(valid));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toBe("[workflow] intake failed intake:Error");
    spy.mockRestore();
  });
});
