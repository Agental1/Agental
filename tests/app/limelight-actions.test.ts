import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Limelight server actions with a mocked session, database and lead
 * core. What is under test is the mapping: which form field goes where, what
 * each outcome of the core becomes for the page, and who may change a lead's
 * status. The core itself is covered in tests/lib/limelight-leads.test.ts.
 */

const recordInterest = vi.fn();
const changeLeadStatus = vi.fn();
const scheduleOutboxDrain = vi.fn();
const auth = vi.fn();
const revalidatePath = vi.fn();
const db = { user: { findUnique: vi.fn() } };
const requestHeaders = new Headers({ "x-real-ip": "203.0.113.7" });

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/lib/limelight/leads", () => ({ recordInterest, changeLeadStatus }));
vi.mock("@/lib/limelight/after-response", () => ({ scheduleOutboxDrain }));

const { requestPortfolioSite, setLeadStatus, submitLimelightLead } = await import("@/app/actions/limelight");
const { LIMELIGHT_DEFAULT_CONSENT_VERSION } = await import("@/domain/limelight");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const stored = { ok: true, reference: "LL-7K2M9QXA", created: true, stored: true, detailsStored: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_SECRET", "test-secret-with-enough-entropy");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestPortfolioSite", () => {
  const fields = {
    name: "Ana Lee",
    email: "ana@example.com",
    performerType: "actor",
    portfolioUrl: "https://ana.example.com",
    need: "redo",
    contactPref: "call",
    phone: "+1 310 555 0142",
    marketingOptIn: "on",
    consentVersion: "request-2026-11",
    source: "limelight-beta",
    locale: "fr",
    company: "",
  };

  it("hands the form to the same core as the route, with the client key", async () => {
    recordInterest.mockResolvedValue(stored);

    expect(await requestPortfolioSite(undefined, form(fields))).toEqual({ ok: true, reference: "LL-7K2M9QXA" });

    expect(recordInterest).toHaveBeenCalledWith(
      {
        name: "Ana Lee",
        email: "ana@example.com",
        performerType: "actor",
        portfolioUrl: "https://ana.example.com",
        need: "redo",
        contactPref: "call",
        phone: "+1 310 555 0142",
        marketingOptIn: true,
        consentVersion: "request-2026-11",
        source: "limelight-beta",
        locale: "fr",
        company: "",
      },
      { clientKey: expect.stringMatching(/^[0-9a-f]{40}$/) }
    );
    expect(scheduleOutboxDrain).toHaveBeenCalledTimes(1);
  });

  it("reads an unticked box as false, a missing consent as absent, and defaults the source", async () => {
    recordInterest.mockResolvedValue({ ok: false, reason: "invalid", fieldErrors: { consentVersion: "errors.consentRequired" } });

    const state = await requestPortfolioSite(undefined, form({ name: "Ana Lee", email: "ana@example.com" }));

    expect(state).toEqual({ ok: false, fieldErrors: { consentVersion: "errors.consentRequired" } });
    expect(recordInterest.mock.calls[0][0]).toMatchObject({
      marketingOptIn: false,
      consentVersion: undefined,
      source: "limelight-page",
    });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it.each(["on", "true", "1", "yes", "ON"])("reads the opt-in checkbox value %j as true", async (value) => {
    recordInterest.mockResolvedValue(stored);
    await requestPortfolioSite(undefined, form({ ...fields, marketingOptIn: value }));
    expect(recordInterest.mock.calls[0][0]).toMatchObject({ marketingOptIn: true });
  });

  it("never passes a file where text is expected", async () => {
    recordInterest.mockResolvedValue({ ok: false, reason: "invalid", fieldErrors: { name: "errors.nameRequired" } });
    const data = form(fields);
    data.set("name", new File(["x"], "name.txt"));

    await requestPortfolioSite(undefined, data);

    expect(recordInterest.mock.calls[0][0]).toMatchObject({ name: undefined });
  });

  it("passes the honeypot through and shows a success like any other", async () => {
    recordInterest.mockResolvedValue({ ok: true, reference: "LL-0000000A", created: false, stored: false, detailsStored: false });

    expect(await requestPortfolioSite(undefined, form({ ...fields, company: "Acme" }))).toEqual({
      ok: true,
      reference: "LL-0000000A",
    });
    expect(recordInterest.mock.calls[0][0]).toMatchObject({ company: "Acme" });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });

  it("turns a rate limit and a failure into their error keys", async () => {
    recordInterest.mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterMs: 1000 });
    expect(await requestPortfolioSite(undefined, form(fields))).toEqual({
      ok: false,
      error: { key: "errors.limelightTooMany" },
    });

    recordInterest.mockResolvedValueOnce({ ok: false, reason: "failed" });
    expect(await requestPortfolioSite(undefined, form(fields))).toEqual({
      ok: false,
      error: { key: "errors.limelightSendFailed" },
    });
    expect(scheduleOutboxDrain).not.toHaveBeenCalled();
  });
});

describe("submitLimelightLead (the form on the page today)", () => {
  const fields = {
    name: "Ana Lee",
    email: "ana@example.com",
    discipline: "musician",
    need: "redo",
    budget: "signature",
    contactPref: "call",
    phone: "+1 310 555 0142",
    message: "I would like a site before pilot season.",
    locale: "fr",
  };

  it("stores the lead through the durable core, with that form's field names mapped", async () => {
    recordInterest.mockResolvedValue(stored);

    expect(await submitLimelightLead(undefined, form(fields))).toEqual({ ok: true, email: "ana@example.com" });

    expect(recordInterest).toHaveBeenCalledWith(
      {
        name: "Ana Lee",
        email: "ana@example.com",
        performerType: "musician",
        locale: "fr",
        // The choice and the message, as one "what they need" text.
        need: "redo: I would like a site before pilot season.",
        contactPref: "call",
        phone: "+1 310 555 0142",
        marketingOptIn: false,
        consentVersion: LIMELIGHT_DEFAULT_CONSENT_VERSION,
        source: "limelight-page",
      },
      { clientKey: expect.stringMatching(/^[0-9a-f]{40}$/) }
    );
    expect(scheduleOutboxDrain).toHaveBeenCalledTimes(1);
  });

  it("records the in-app source, and falls back to the public page for anything else", async () => {
    recordInterest.mockResolvedValue(stored);
    await submitLimelightLead(undefined, form({ ...fields, source: "app-site-panel" }));
    expect(recordInterest.mock.calls[0][0]).toMatchObject({ source: "app-site-panel" });
    recordInterest.mockClear();
    recordInterest.mockResolvedValue(stored);
    await submitLimelightLead(undefined, form({ ...fields, source: "evil-campaign" }));
    expect(recordInterest.mock.calls[0][0]).toMatchObject({ source: "limelight-page" });
  });

  it("sends the choice alone when there is no message", async () => {
    recordInterest.mockResolvedValue(stored);

    await submitLimelightLead(undefined, form({ ...fields, message: "  \n " }));

    expect(recordInterest.mock.calls[0][0]).toMatchObject({ need: "redo" });
  });

  it("puts a message with line breaks on one line", async () => {
    recordInterest.mockResolvedValue(stored);

    await submitLimelightLead(undefined, form({ ...fields, message: "A reel.\n\nAnd photos." }));

    expect(recordInterest.mock.calls[0][0]).toMatchObject({ need: "redo: A reel. And photos." });
  });

  it("keeps the choice and says so in the log when the message is too long to store", async () => {
    recordInterest.mockResolvedValue(stored);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const longMessage = "I need a site. ".repeat(60);

    expect(await submitLimelightLead(undefined, form({ ...fields, message: longMessage }))).toEqual({
      ok: true,
      email: "ana@example.com",
    });

    expect(recordInterest.mock.calls[0][0]).toMatchObject({ need: "redo" });
    const line = warn.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(line).toContain("LL-7K2M9QXA");
    expect(line).not.toContain("I need a site");
    warn.mockRestore();
  });

  it("stores a message that fits exactly, with its choice", async () => {
    recordInterest.mockResolvedValue(stored);
    const message = "m".repeat(500 - "redo: ".length);

    await submitLimelightLead(undefined, form({ ...fields, message }));

    const { need } = recordInterest.mock.calls[0][0] as { need: string };
    expect(need).toHaveLength(500);
    expect(need.startsWith("redo: ")).toBe(true);
  });

  it("forwards nothing anywhere: no webhook is called, whatever the environment says", async () => {
    vi.stubEnv("LIMELIGHT_LEADS_WEBHOOK_URL", "https://n8n.example.test/webhook/leads");
    vi.stubEnv("N8N_SIGNING_SECRET", "signing-secret");
    const fetchSpy = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
    recordInterest.mockResolvedValue(stored);

    await submitLimelightLead(undefined, form(fields));

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not report success when the lead was not stored", async () => {
    recordInterest.mockResolvedValue({ ok: false, reason: "failed" });

    expect(await submitLimelightLead(undefined, form(fields))).toEqual({
      error: { key: "errors.limelightSendFailed" },
    });
  });

  it("keeps that form's own validation and error key", async () => {
    expect(await submitLimelightLead(undefined, form({ ...fields, name: " " }))).toEqual({
      error: { key: "errors.limelightContactRequired" },
    });
    expect(await submitLimelightLead(undefined, form({ ...fields, email: "nope" }))).toEqual({
      error: { key: "errors.emailInvalid" },
    });
    expect(recordInterest).not.toHaveBeenCalled();
  });

  it("answers the honeypot as before, and never reaches the core", async () => {
    expect(await submitLimelightLead(undefined, form({ ...fields, company: "Acme" }))).toEqual({
      ok: true,
      email: "",
    });
    expect(recordInterest).not.toHaveBeenCalled();
  });

  it("shows the core's first field error, the rate limit, as a single error", async () => {
    recordInterest.mockResolvedValueOnce({
      ok: false,
      reason: "invalid",
      fieldErrors: { phone: "errors.phoneRequired" },
    });
    expect(await submitLimelightLead(undefined, form({ ...fields, phone: "" }))).toEqual({
      error: { key: "errors.phoneRequired" },
    });

    recordInterest.mockResolvedValueOnce({ ok: false, reason: "rate_limited", retryAfterMs: 1 });
    expect(await submitLimelightLead(undefined, form(fields))).toEqual({
      error: { key: "errors.limelightTooMany" },
    });
  });
});

describe("setLeadStatus", () => {
  function signIn(isAdmin: boolean | null) {
    auth.mockResolvedValue({ user: { id: "u1", kind: "TALENT" } });
    db.user.findUnique.mockResolvedValue(isAdmin === null ? null : { isAdmin });
  }

  it("refuses a visitor", async () => {
    auth.mockResolvedValue(null);
    expect(await setLeadStatus("lead1", "CONTACTED")).toEqual({ ok: false, error: { key: "errors.unauthorized" } });
    expect(changeLeadStatus).not.toHaveBeenCalled();
  });

  it.each([false, null])("refuses a signed-in account that is not an admin (isAdmin: %j)", async (isAdmin) => {
    signIn(isAdmin);
    expect(await setLeadStatus("lead1", "CONTACTED")).toEqual({ ok: false, error: { key: "errors.forbidden" } });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { isAdmin: true } });
    expect(changeLeadStatus).not.toHaveBeenCalled();
  });

  it.each(["NEW", "CONTACTED", "CLOSED"] as const)("lets an admin set %s", async (status) => {
    signIn(true);
    changeLeadStatus.mockResolvedValue({ before: "NEW", after: status });

    expect(await setLeadStatus(" lead1 ", status)).toEqual({ ok: true, status });
    expect(changeLeadStatus).toHaveBeenCalledWith("lead1", status, "u1");
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/admin", "layout");
  });

  it("refuses a status it does not know, and an empty id", async () => {
    signIn(true);
    expect(await setLeadStatus("lead1", "ARCHIVED" as never)).toEqual({
      ok: false,
      error: { key: "errors.invalidInput" },
    });
    expect(await setLeadStatus("", "CLOSED")).toEqual({ ok: false, error: { key: "errors.invalidInput" } });
    expect(changeLeadStatus).not.toHaveBeenCalled();
  });

  it("answers errors.notFound for a lead that does not exist", async () => {
    signIn(true);
    changeLeadStatus.mockResolvedValue(null);

    expect(await setLeadStatus("nope", "CLOSED")).toEqual({ ok: false, error: { key: "errors.notFound" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
