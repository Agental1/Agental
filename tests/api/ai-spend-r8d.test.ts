import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { alertsFor, centsFromInput, remainingCents, type ProviderState } from "@/domain/ai-spend";

/**
 * Round 8d, group 4: AI accounts. Agental only READS spend (GET on report
 * endpoints), a missing key reads "Not connected", Perplexity is manual,
 * alerts go out once, and only an admin can type a balance.
 */
const P = "test-aispend-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const session = vi.fn();
const sendEmail = vi.fn(async () => ({ ok: true as const, mode: "log" as const }));
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendEmail }));

const { spendSince, sendSpendAlerts, ALERT_EMAIL } = await import("@/lib/ai-spend");
const { saveAiAccount } = await import("@/app/actions/ai-spend");

const base: ProviderState = {
  provider: "openai",
  source: "live",
  monthSpendCents: 0,
  spendSinceBalanceCents: 0,
  balanceCents: null,
  balanceSetAt: null,
  thresholdCents: 2000,
  monthlyBudgetCents: null,
};
const now = new Date("2026-11-22T12:00:00Z");

describe("AI spend rules", () => {
  it("reads typed amounts", () => {
    expect(centsFromInput("$20")).toBe(2000);
    expect(centsFromInput("1,250.5")).toBe(125050);
    expect(centsFromInput("")).toBeNull();
    expect(centsFromInput("-5")).toBeUndefined();
    expect(centsFromInput("abc")).toBeUndefined();
  });

  it("left = typed balance minus spend since; alerts under the threshold and past 80% of the budget", () => {
    const s = { ...base, balanceCents: 5000, balanceSetAt: now, spendSinceBalanceCents: 3200 };
    expect(remainingCents(s)).toBe(1800);
    expect(alertsFor(s, now).map((a) => a.kind)).toEqual(["low_balance"]);
    expect(alertsFor({ ...s, spendSinceBalanceCents: 100 }, now)).toEqual([]);
    const budget = { ...base, monthlyBudgetCents: 10000, monthSpendCents: 8100 };
    expect(alertsFor(budget, now).map((a) => a.key)).toEqual(["openai:budget:2026-11"]);
    expect(alertsFor({ ...budget, monthSpendCents: 7900 }, now)).toEqual([]);
  });
});

describe("provider reads", () => {
  it("is Not connected without a key, manual for Perplexity", async () => {
    const f = vi.fn();
    expect(await spendSince("openai", now, {}, f as never)).toEqual({ source: "not_connected", cents: null });
    expect(await spendSince("anthropic", now, {}, f as never)).toEqual({ source: "not_connected", cents: null });
    expect(await spendSince("perplexity", now, { PERPLEXITY_API_KEY: "x" }, f as never)).toEqual({ source: "manual", cents: null });
    expect(f).not.toHaveBeenCalled();
  });

  it("only GETs the providers' cost reports and sums them", async () => {
    const f = vi.fn(async (url: URL) =>
      url.hostname === "api.openai.com"
        ? Response.json({ data: [{ results: [{ amount: { value: 1.5, currency: "usd" } }] }, { results: [{ amount: { value: 2.25, currency: "usd" } }] }], has_more: false })
        : Response.json({ data: [{ results: [{ amount: "120.5", currency: "USD" }, { amount: "79.5", currency: "USD" }] }], has_more: false })
    );
    expect(await spendSince("openai", now, { OPENAI_ADMIN_KEY: "k" }, f as never)).toEqual({ source: "live", cents: 375 });
    expect(await spendSince("anthropic", now, { ANTHROPIC_ADMIN_KEY: "k" }, f as never)).toEqual({ source: "live", cents: 200 });
    for (const [url, init] of f.mock.calls as unknown as [URL, RequestInit][]) {
      expect(init.method ?? "GET").toBe("GET");
      expect(init.body).toBeUndefined();
      expect(["/v1/organization/costs", "/v1/organizations/cost_report"]).toContain(url.pathname);
    }
  });

  it("says so when the provider refuses, without throwing", async () => {
    const f = vi.fn(async () => new Response("no", { status: 401 }));
    expect(await spendSince("openai", now, { OPENAI_ADMIN_KEY: "k" }, f as never)).toEqual({ source: "error", cents: null });
  });
});

describe.skipIf(!local)("alerts and settings against the database", () => {
  let admin = "";
  let talent = "";
  beforeAll(async () => {
    vi.stubEnv("ADMIN_MFA_REQUIRED", "false");
    await prisma.aiProviderAccount.deleteMany({});
    admin = (await prisma.user.create({ data: { email: `${P}admin@test.local`, kind: "TALENT", isAdmin: true } })).id;
    talent = (await prisma.user.create({ data: { email: `${P}talent@test.local`, kind: "TALENT" } })).id;
  });
  afterAll(async () => {
    await prisma.aiProviderAccount.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [admin, talent] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    vi.unstubAllEnvs();
  });
  beforeEach(() => sendEmail.mockClear());

  it("only an admin can type a balance; it is audited", async () => {
    session.mockResolvedValue({ user: { id: talent, kind: "TALENT" } });
    expect(await saveAiAccount({ provider: "perplexity", balance: "15", threshold: "", budget: "" })).toMatchObject({ ok: false });
    session.mockResolvedValue({ user: { id: admin, kind: "TALENT" } });
    expect(await saveAiAccount({ provider: "perplexity", balance: "15", threshold: "", budget: "" })).toEqual({ ok: true });
    const row = await prisma.aiProviderAccount.findUniqueOrThrow({ where: { provider: "perplexity" } });
    expect(row).toMatchObject({ balanceCents: 1500, thresholdCents: 2000 });
    expect(await prisma.auditLog.count({ where: { actorUserId: admin, action: "admin.ai_account.save" } })).toBe(1);
    expect(await saveAiAccount({ provider: "stripe", balance: "1", threshold: "", budget: "" })).toMatchObject({ ok: false });
  });

  it("a low balance alerts the admins' bell and contact@agental.co, once", async () => {
    const row = await prisma.aiProviderAccount.findUniqueOrThrow({ where: { provider: "perplexity" } });
    const state: ProviderState = { ...base, provider: "perplexity", source: "manual", monthSpendCents: null, spendSinceBalanceCents: null, balanceCents: 1500, balanceSetAt: row.balanceSetAt };
    expect((await sendSpendAlerts([state])).length).toBe(1);
    expect((await sendSpendAlerts([state])).length).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin, kind: "ALERT" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: talent, kind: "ALERT" } })).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]).toEqual([expect.objectContaining({ to: ALERT_EMAIL })]);
  });
});
