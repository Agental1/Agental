import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three Limelight route handlers, called directly with a Request. The
 * lead core, the outbox and the session are mocked: what is under test is
 * the HTTP contract (status, body, headers) and who gets in. The same routes
 * run against a real database in tests/api/limelight-leads.test.ts.
 */

const recordInterest = vi.fn();
const listLimelightLeads = vi.fn();
const scheduleOutboxDrain = vi.fn();
const drainOutbox = vi.fn();
const currentAdminId = vi.fn();
const audit = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/limelight/leads", () => ({ recordInterest, listLimelightLeads, LEADS_MAX_LIMIT: 5000 }));
vi.mock("@/lib/limelight/after-response", () => ({ scheduleOutboxDrain }));
vi.mock("@/lib/limelight/outbox", () => ({ drainOutbox }));
vi.mock("@/lib/limelight/admin", () => ({ currentAdminId }));
vi.mock("@/lib/audit", () => ({ audit }));

const interest = await import("@/app/api/limelight/interest/route");
const drain = await import("@/app/api/limelight/outbox/drain/route");
const leadsCsv = await import("@/app/api/admin/limelight/leads.csv/route");

const body = {
  name: "Ana Lee",
  email: "ana@example.com",
  consentVersion: "request-2026-11",
  source: "limelight-page",
};

function post(payload: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/limelight/interest", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7", ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/limelight/interest", () => {
  it("201: answers the reference once the lead is stored, then schedules one drain", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-7K2M9QXA", created: true, stored: true, detailsStored: true });

    const res = await interest.POST(post(body));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, reference: "LL-7K2M9QXA" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(recordInterest).toHaveBeenCalledWith(body, { clientKey: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(scheduleOutboxDrain).toHaveBeenCalledTimes(1);
    // The drain is scheduled after the lead was stored, never before.
    expect(scheduleOutboxDrain.mock.invocationCallOrder[0]).toBeGreaterThan(
      recordInterest.mock.invocationCallOrder[0]
    );
  });

  it("201: hands the core a keyed hash of the client address, never the address", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-7K2M9QXA", created: true, stored: true, detailsStored: true });

    await interest.POST(post(body));
    await interest.POST(post(body, { "x-real-ip": "198.51.100.9" }));

    const keys = recordInterest.mock.calls.map((call) => (call[1] as { clientKey: string }).clientKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(JSON.stringify(recordInterest.mock.calls)).not.toMatch(/203\.0\.113\.7|198\.51\.100\.9/);
  });

  it("201: a repeat gets its reference again, and no drain is scheduled for it", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-7K2M9QXA", created: false, stored: true, detailsStored: true });

    const res = await interest.POST(post(body));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, reference: "LL-7K2M9QXA" });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it("201: a filled honeypot looks exactly like a success", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-0000000A", created: false, stored: false, detailsStored: false });

    const res = await interest.POST(post({ ...body, company: "Acme" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, reference: "LL-0000000A" });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it("201: says nothing about whether the lead was new or its details were stored", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-7K2M9QXA", created: true, stored: true, detailsStored: false });
    expect(Object.keys(await (await interest.POST(post(body))).json()).sort()).toEqual(["ok", "reference"]);
  });

  it("400: one error key per field", async () => {
    recordInterest.mockResolvedValue({
      ok: false,
      reason: "invalid",
      fieldErrors: { email: "errors.emailInvalid", phone: "errors.phoneRequired" },
    });

    const res = await interest.POST(post({ ...body, email: "nope", contactPref: "call" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      fieldErrors: { email: "errors.emailInvalid", phone: "errors.phoneRequired" },
    });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it.each([
    ["a form post", post("name=Ana", { "content-type": "application/x-www-form-urlencoded" })],
    ["text/plain", post(JSON.stringify(body), { "content-type": "text/plain" })],
    ["broken JSON", post('{"name": "Ana"')],
    ["a JSON array", post([body])],
    ["a JSON string", post('"hello"')],
    ["JSON null", post("null")],
    ["a body over 8 KB", post({ ...body, name: "a".repeat(9000) })],
  ])("400: refuses %s before the core is reached", async (_label, req) => {
    const res = await interest.POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "errors.invalidInput", fieldErrors: {} });
    expect(recordInterest).not.toHaveBeenCalled();
  });

  it("429: says when to come back", async () => {
    recordInterest.mockResolvedValue({ ok: false, reason: "rate_limited", retryAfterMs: 90_500 });

    const res = await interest.POST(post(body));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: "errors.limelightTooMany" });
    expect(res.headers.get("retry-after")).toBe("91");
  });

  it("500: a generic, retryable answer with no detail", async () => {
    recordInterest.mockResolvedValue({ ok: false, reason: "failed" });

    const res = await interest.POST(post(body));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "errors.limelightSendFailed" });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it("offers POST only", () => {
    expect(Object.keys(interest).sort()).toEqual(["POST"]);
  });
});

describe("/api/limelight/outbox/drain", () => {
  const call = (method: "GET" | "POST", authorization?: string) =>
    drain[method](
      new Request("https://app.test/api/limelight/outbox/drain", {
        method,
        headers: authorization ? { authorization } : {},
      })
    );

  it.each(["GET", "POST"] as const)("%s is 404 while CRON_SECRET is unset, even with a token", async (method) => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call(method, "Bearer anything");

    expect(res.status).toBe(404);
    expect(drainOutbox).not.toHaveBeenCalled();
  });

  it.each([
    ["no header", undefined],
    ["a wrong token", "Bearer wrong-secret-value"],
    ["a prefix of the token", "Bearer cron-secret"],
    ["another scheme", "Basic cron-secret-value"],
  ])("is 401 with %s, and drains nothing", async (_label, authorization) => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const res = await call("GET", authorization);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
    expect(drainOutbox).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"] as const)("%s drains with the right token and answers counts only", async (method) => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    drainOutbox.mockResolvedValue({ configured: true, due: 3, sent: 2, retried: 1, dead: 0, skipped: 0 });

    const res = await call(method, "Bearer cron-secret-value");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, configured: true, due: 3, sent: 2, retried: 1, dead: 0, skipped: 0 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(drainOutbox).toHaveBeenCalledTimes(1);
  });

  it("answers 500 with no detail when the drain itself fails", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    drainOutbox.mockRejectedValue(new Error("connection reset for owner@agental.test"));

    const res = await call("POST", "Bearer cron-secret-value");

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"ok":false}');
  });
});

describe("GET /api/admin/limelight/leads.csv", () => {
  const get = (query = "") => leadsCsv.GET(new Request(`https://app.test/api/admin/limelight/leads.csv${query}`));

  const lead = (over: Record<string, unknown> = {}) => ({
    id: "lead1",
    reference: "LL-7K2M9QXA",
    name: "Lee, Ana",
    email: "ana@example.com",
    performerType: "actor",
    portfolioUrl: null,
    need: "redo",
    contactPref: "call",
    phone: "+1 310 555 0142",
    source: "limelight-page",
    consentVersion: "request-2026-11",
    marketingOptIn: true,
    locale: "en",
    status: "NEW",
    submissions: 2,
    firstSeenAt: new Date("2026-11-19T10:00:00Z"),
    lastSeenAt: new Date("2026-11-19T10:05:00Z"),
    alert: "SENT",
    ...over,
  });

  it("is a plain 404 for anyone who is not an admin, and reads nothing", async () => {
    currentAdminId.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(listLimelightLeads).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("sends an admin a CSV attachment that is never cached", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([lead()]);

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="limelight-leads-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("writes a header row, quotes per RFC 4180 and neutralizes formulas", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([
      lead(),
      lead({
        reference: "LL-0000000B",
        name: '=HYPERLINK("https://evil.example","x")',
        email: "bo@example.com",
        performerType: null,
        portfolioUrl: "https://bo.example.com",
        need: null,
        contactPref: "email",
        phone: null,
        marketingOptIn: false,
        submissions: 1,
        alert: null,
      }),
    ]);

    const text = await (await get()).text();

    expect(text.split("\r\n")).toEqual([
      "reference,name,email,performerType,portfolioUrl,need,contactPref,phone,source,consentVersion,marketingOptIn,locale,status,submissions,firstSeenAt,lastSeenAt,alert",
      'LL-7K2M9QXA,"Lee, Ana",ana@example.com,actor,,redo,call,\'+1 310 555 0142,limelight-page,request-2026-11,true,en,NEW,2,2026-11-19T10:00:00.000Z,2026-11-19T10:05:00.000Z,SENT',
      'LL-0000000B,"\'=HYPERLINK(""https://evil.example"",""x"")",bo@example.com,,https://bo.example.com,,email,,limelight-page,request-2026-11,false,en,NEW,1,2026-11-19T10:00:00.000Z,2026-11-19T10:05:00.000Z,',
      "",
    ]);
  });

  it("starts the file with a UTF-8 byte order mark, so Excel reads accents", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([lead({ name: "Chloé Müller" })]);

    const bytes = new Uint8Array(await (await get()).arrayBuffer());

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("Chloé Müller");
  });

  it("audits each export with the row count, and no row", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([lead(), lead({ reference: "LL-0000000B" })]);

    await get();

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      actorUserId: "admin1",
      action: "limelight.leads.export",
      resourceType: "LimelightLead",
      resourceId: "csv",
      after: { rows: 2, status: null },
    });
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/ana|example/i);
  });

  it("exports an empty list as the header row alone, still audited", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([]);

    const text = await (await get()).text();

    expect(text.split("\r\n")).toHaveLength(2);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ after: { rows: 0, status: null } }));
  });

  it("narrows by a known status and ignores an unknown one", async () => {
    currentAdminId.mockResolvedValue("admin1");
    listLimelightLeads.mockResolvedValue([]);

    await get("?status=CONTACTED");
    expect(listLimelightLeads).toHaveBeenLastCalledWith({ status: "CONTACTED", limit: 5000 });
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ after: { rows: 0, status: "CONTACTED" } }));

    await get("?status=everything");
    expect(listLimelightLeads).toHaveBeenLastCalledWith({ status: undefined, limit: 5000 });
  });
});
