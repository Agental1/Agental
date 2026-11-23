import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { B2C_PLANS } from "@/domain/pricing";

/**
 * Round 8d, group 3: prices, promotions, plans and quotas are read on the
 * server only. Whatever a modified request sends (a price, a fake promotion,
 * a plan object, extra fields), the server keeps its own figures and the
 * account's plan and allowance do not move.
 */
const P = "test-pricetamper-";
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const { recordPlanChoice } = await import("@/app/actions/checkout");
const { startFindingRoles } = await import("@/app/actions/role-search");
const { getRoleSearchQuota } = await import("@/lib/role-search");
const { getTalentPlan } = await import("@/lib/billing/entitlement");

describe.skipIf(!local)("prices and quotas cannot be changed from the browser", () => {
  let id = "";
  beforeAll(async () => {
    id = (await prisma.user.create({ data: { email: `${P}a@test.local`, kind: "TALENT", emailVerified: new Date() } })).id;
    session.mockResolvedValue({ user: { id, kind: "TALENT" } });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: id } });
    await prisma.rateLimitEvent.deleteMany({ where: { key: { contains: id } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("records the configured price, never one the request sends", async () => {
    // A modified request: a price argument and a promotion the account is not verified for.
    const call = recordPlanChoice as unknown as (...a: unknown[]) => ReturnType<typeof recordPlanChoice>;
    expect(await call("PRO", "usc-student", { priceCents: 1 })).toEqual({ ok: true });
    expect(await call({ plan: "PRO", priceCents: 1 }, null)).toMatchObject({ ok: false });
    expect(await call("PREMIUM", "made-up-promo-free")).toEqual({ ok: true });
    const rows = await prisma.planChoice.findMany({ where: { userId: id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.plan, r.priceCents, r.promotionId])).toEqual([
      ["PRO", B2C_PLANS.PRO.priceCents, null],
      ["PREMIUM", B2C_PLANS.PREMIUM.priceCents, null],
    ]);
  });

  it("choosing a plan changes neither the plan nor the search allowance", async () => {
    expect((await getTalentPlan(id)).plan).toBe("FREE");
    expect((await getRoleSearchQuota(id)).limit).toBe(B2C_PLANS.FREE.aiSearches!.count);
  });

  it("a search launch takes no plan or quota from the request", async () => {
    const call = startFindingRoles as unknown as (...a: unknown[]) => ReturnType<typeof startFindingRoles>;
    const res = await call("click_tamper_0001", { plan: "ULTIMATE", limit: 500, remaining: 500 });
    // Refused for eligibility (incomplete profile); the quota stays the plan's.
    expect(res.ok).toBe(false);
    expect((await getRoleSearchQuota(id)).limit).toBe(B2C_PLANS.FREE.aiSearches!.count);
    expect(await call({ clientKey: "click_tamper_0002", plan: "ULTIMATE" })).toMatchObject({ ok: false, error: { key: "errors.invalidInput" } });
  });
});
