import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";

/**
 * Round 8d, group 2: parallel slots per plan, the quota reset date, and the
 * first automatic search for a fresh Test account going from just under 100%
 * to 100% (production's test mode), then the rest of Basic's month by hand.
 */
const P = "test-slots8d-";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

const { startRoleSearch, getRoleSearchQuota, getMySearchStatus } = await import("@/lib/role-search");
const { recomputeCompleteness } = await import("@/lib/completeness");
const { claimCastingJobs } = await import("@/lib/n8n/casting");

const H = 3600_000;
let parked: { id: string; status: string }[] = [];

async function performer(name: string, data: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) {
  const u = await prisma.user.create({
    data: {
      email: `${P}${name}@test.local`,
      kind: "TALENT",
      accountStatus: "TEST",
      emailVerified: new Date(),
      ...data,
      artistProfile: {
        create: { stageName: name, birthDate: new Date("1990-01-01T00:00:00Z"), ...completeProfile(`${P}${name}`), ...profile },
      },
    },
  });
  return u.id;
}

describe.skipIf(!local)("round 8d search slots", () => {
  beforeAll(async () => {
    vi.stubEnv("WORKFLOW_MODE", "");
    parked = await prisma.roleSearchRequest.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true, status: true } });
    await prisma.roleSearchRequest.updateMany({ where: { id: { in: parked.map((r) => r.id) } }, data: { status: "parked_by_test" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    for (const r of parked) await prisma.roleSearchRequest.update({ where: { id: r.id }, data: { status: r.status } });
    vi.unstubAllEnvs();
  });

  it("a fresh Test account at 100% gets its first search at once, then launches the other 4 itself (Basic)", async () => {
    const id = await performer("fresh", {}, { bio: "" });
    const profile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: id } });
    const before = await recomputeCompleteness(profile.id);
    expect(before).toBeLessThan(100);
    expect(await prisma.roleSearchRequest.count({ where: { userId: id } })).toBe(0);

    await prisma.artistProfile.update({ where: { id: profile.id }, data: { bio: "Trained stage and screen actor." } });
    expect(await recomputeCompleteness(profile.id)).toBe(100);
    const first = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: id } });
    expect(first).toMatchObject({ clientKey: "auto_first", status: "queued" });

    // Shown at once in the dashboard status.
    expect(await getMySearchStatus(id)).toMatchObject({ queued: 1, running: 0, slots: 1 });

    const now = new Date();
    for (let i = 1; i <= 4; i++) {
      const res = await startRoleSearch(id, `click_r8d_${i}_0000`, now);
      expect(res.ok).toBe(true);
    }
    expect((await getRoleSearchQuota(id, now)).remaining).toBe(0);
    expect(await startRoleSearch(id, "click_r8d_5_0000", now)).toMatchObject({ ok: false, reason: "quota_exhausted" });

    // One slot: one start every 6 hours.
    const starts = (await prisma.roleSearchRequest.findMany({ where: { userId: id }, orderBy: { scheduledFor: "asc" } })).map(
      (r) => r.scheduledFor!.getTime()
    );
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(6 * H - 1000);
  });

  it("Pro runs two at the same time; the n8n claim takes two, never three", async () => {
    const id = await performer("pro");
    await prisma.subscription.create({ data: { subjectType: "ARTIST", subjectId: id, plan: "PRO", status: "ACTIVE" } });
    const now = new Date();
    for (let i = 1; i <= 3; i++) expect((await startRoleSearch(id, `click_pro_${i}_0000`, now)).ok).toBe(true);
    const rows = await prisma.roleSearchRequest.findMany({ where: { userId: id }, orderBy: { scheduledFor: "asc" } });
    expect(rows.map((r) => Math.round((r.scheduledFor!.getTime() - now.getTime()) / H))).toEqual([0, 0, 6]);
    expect(await getMySearchStatus(id, now)).toMatchObject({ queued: 3, slots: 2 });

    // Make all three due, as if 6 hours passed with nothing claimed.
    await prisma.roleSearchRequest.updateMany({ where: { userId: id }, data: { scheduledFor: new Date(now.getTime() - H) } });
    const claim = await claimCastingJobs({ limit: 10, executionId: `${P}exec` }, { now, mode: "staging" });
    const running = await prisma.roleSearchRequest.count({ where: { userId: id, status: "running" } });
    expect(running).toBe(2);
    const mine = new Set(rows.map((r) => r.id));
    expect(claim.jobs.filter((j) => mine.has(j.requestId)).length).toBe(2);
    // A second execution right after gets nothing more for this performer.
    await claimCastingJobs({ limit: 10, executionId: `${P}exec2` }, { now, mode: "staging" });
    expect(await prisma.roleSearchRequest.count({ where: { userId: id, status: "running" } })).toBe(2);
  });

  it("a quota reset date gives the full allowance back and keeps the rows", async () => {
    const id = await performer("reset");
    const now = new Date();
    for (let i = 1; i <= 5; i++) await startRoleSearch(id, `click_rst_${i}_0000`, now);
    expect((await getRoleSearchQuota(id, now)).remaining).toBe(0);
    await prisma.user.update({ where: { id }, data: { searchQuotaResetAt: new Date(now.getTime() + 1000), searchPeriodStartedAt: null } });
    const later = new Date(now.getTime() + 2000);
    expect((await getRoleSearchQuota(id, later)).remaining).toBe(5);
    expect(await prisma.roleSearchRequest.count({ where: { userId: id } })).toBe(5);
    expect((await startRoleSearch(id, "click_rst_6_0000", later)).ok).toBe(true);
  });
});
