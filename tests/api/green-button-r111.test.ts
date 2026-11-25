import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";

/**
 * Round 11.1, group 3 (founder): the green button is open to every performer
 * at 100% with a verified email (Google counts), Test or not; searches are
 * queued, and run only while "Run searches" is on (off by default, the n8n
 * claim hands out nothing). The allowance is used when a search starts, but
 * queued + running + used may never pass it (Basic: 5 a month, the first
 * automatic search included). In test mode only Test accounts run.
 */
const P = "test-green111-";
const SECRET = "test-n8n-secret-with-enough-length-0123";
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const { startFindingRoles } = await import("@/app/actions/role-search");
const { getRoleSearchQuota, getMySearchStatus } = await import("@/lib/role-search");
const { recomputeCompleteness } = await import("@/lib/completeness");
const { searchesRunning, searchAccess } = await import("@/lib/app-settings");
const claimRoute = await import("@/app/api/n8n/casting/claim/route");

const SETTING_KEYS = ["search.run", "search.access"];
let savedSettings: { key: string; value: string; updatedById: string | null }[] = [];
let parked: { id: string; status: string }[] = [];

const claim = () =>
  claimRoute.POST(
    new Request("https://app.test/api/n8n/casting/claim", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ limit: 10, executionId: `${P}exec-${Math.random().toString(36).slice(2, 8)}` }),
    })
  );

async function setRun(running: boolean) {
  const value = JSON.stringify({ running, since: new Date().toISOString() });
  await prisma.appSetting.upsert({ where: { key: "search.run" }, create: { key: "search.run", value }, update: { value } });
}

/** A performer one step under 100% (no bio), unless `complete`. */
async function performer(name: string, data: Record<string, unknown> = {}, complete = false) {
  const u = await prisma.user.create({
    data: {
      email: `${P}${name}@test.local`,
      kind: "TALENT",
      accountStatus: "UNREVIEWED",
      emailVerified: new Date(),
      ...data,
      artistProfile: {
        create: {
          stageName: name,
          birthDate: new Date("1990-01-01T00:00:00Z"),
          ...completeProfile(`${P}${name}`),
          ...(complete ? {} : { bio: "" }),
        },
      },
    },
  });
  return u.id;
}

async function reach100(userId: string) {
  const profile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId } });
  await prisma.artistProfile.update({ where: { id: profile.id }, data: { bio: "Trained stage and screen actor." } });
  return recomputeCompleteness(profile.id);
}

const click = async (userId: string, n: number) => {
  session.mockResolvedValue({ user: { id: userId, kind: "TALENT", email: `${P}x@test.local` } });
  return startFindingRoles(`click_g111_${userId.slice(-6)}_${n}`);
};

describe.skipIf(!local)("round 11.1 green button and Run searches", () => {
  beforeAll(async () => {
    vi.stubEnv("WORKFLOW_MODE", "");
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    savedSettings = await prisma.appSetting.findMany({ where: { key: { in: SETTING_KEYS } }, select: { key: true, value: true, updatedById: true } });
    // The founder's defaults: nothing stored.
    await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
    parked = await prisma.roleSearchRequest.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true, status: true } });
    await prisma.roleSearchRequest.updateMany({ where: { id: { in: parked.map((r) => r.id) } }, data: { status: "parked_by_test" } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    for (const r of parked) await prisma.roleSearchRequest.update({ where: { id: r.id }, data: { status: r.status } });
    await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
    for (const s of savedSettings) await prisma.appSetting.create({ data: s });
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    await prisma.appSetting.deleteMany({ where: { key: "search.run" } });
  });

  it("defaults: queuing open to all verified performers at 100%, Run searches off", async () => {
    expect(await searchAccess()).toBe("all_verified");
    expect(await searchesRunning()).toBe(false);
  });

  it("a real performer going from 99% to 100% queues the first search; 4 clicks queue 4 more; the 6th is refused", async () => {
    const id = await performer("real");
    expect(await prisma.roleSearchRequest.count({ where: { userId: id } })).toBe(0);
    expect(await reach100(id)).toBe(100);
    const first = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: id } });
    expect(first).toMatchObject({ clientKey: "auto_first", status: "queued" });

    for (let i = 1; i <= 4; i++) {
      const res = await click(id, i);
      expect(res.ok).toBe(true);
      // While Run searches is off: queued, no start time.
      if (res.ok) expect(res.notice).toEqual({ kind: "waiting" });
    }
    expect(await prisma.roleSearchRequest.count({ where: { userId: id, status: "queued" } })).toBe(5);

    // Quota untouched while queued: nothing used, but all 5 places held.
    expect(await getRoleSearchQuota(id)).toMatchObject({ limit: 5, used: 0, held: 5, remaining: 0 });
    const status = await getMySearchStatus(id);
    expect(status).toMatchObject({ queued: 5, waiting: true, nextStart: null });

    const sixth = await click(id, 6);
    expect(sixth).toMatchObject({ ok: false, error: { key: "errors.roleSearchQuota" } });
    expect(await prisma.roleSearchRequest.count({ where: { userId: id } })).toBe(5);
  });

  it("the claim hands out nothing while Run searches is off; on, a Test account runs and a real one stays queued", async () => {
    const tester = await performer("tester", { accountStatus: "TEST" }, true);
    const real = await performer("real-run", {}, true);
    expect((await click(tester, 1)).ok).toBe(true);
    expect((await click(real, 1)).ok).toBe(true);
    await prisma.roleSearchRequest.updateMany({ where: { userId: { in: [tester, real] } }, data: { scheduledFor: new Date(Date.now() - 60_000) } });

    const off = await claim();
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ jobs: [], running: false });
    expect(await prisma.roleSearchRequest.count({ where: { userId: { in: [tester, real] }, status: "queued" } })).toBe(2);
    expect((await getRoleSearchQuota(tester)).used).toBe(0);

    await setRun(true);
    const on = (await (await claim()).json()) as { jobs: { requestId: string }[] };
    const testerRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: tester } });
    expect(on.jobs.map((j) => j.requestId)).toContain(testerRow.id);
    expect(testerRow.status).toBe("running");
    // Test mode: the real performer's search is neither run nor canceled.
    expect(await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: real } })).toMatchObject({ status: "queued" });
    // Used once it started.
    expect(await getRoleSearchQuota(tester)).toMatchObject({ used: 1, held: 1, remaining: 4 });
    // The real account's queue shows no start time (it cannot run in test mode).
    expect(await getMySearchStatus(real)).toMatchObject({ waiting: true, nextStart: null });
  });

  it("unverified or below 100% is still refused with its reason", async () => {
    const unverified = await performer("unverified", { emailVerified: null, passwordHash: "x" }, true);
    expect(await click(unverified, 1)).toMatchObject({ ok: false, error: { key: "errors.agentsEmailUnverified" }, block: { reason: "email_unverified" } });
    const partial = await performer("partial");
    expect(await click(partial, 1)).toMatchObject({ ok: false, error: { key: "errors.agentsProfileIncomplete" }, block: { reason: "profile_incomplete" } });
    expect(await prisma.roleSearchRequest.count({ where: { userId: { in: [unverified, partial] } } })).toBe(0);
  });

  it("a Google account counts as verified", async () => {
    const google = await performer("google", { emailVerified: null, accounts: { create: { type: "oauth", provider: "google", providerAccountId: `${P}g1` } } });
    expect(await reach100(google)).toBe(100);
    expect(await prisma.roleSearchRequest.findFirst({ where: { userId: google } })).toMatchObject({ clientKey: "auto_first", status: "queued" });
  });

  it("a Staff + Test account (like the founder's) behaves the same", async () => {
    const founder = await performer("staff-test", { accountStatus: "TEST", isStaff: true });
    expect(await reach100(founder)).toBe(100);
    expect(await prisma.roleSearchRequest.findFirst({ where: { userId: founder } })).toMatchObject({ clientKey: "auto_first", status: "queued" });
    for (let i = 1; i <= 4; i++) expect((await click(founder, i)).ok).toBe(true);
    expect(await getRoleSearchQuota(founder)).toMatchObject({ used: 0, held: 5, remaining: 0 });
    expect(await click(founder, 6)).toMatchObject({ ok: false, error: { key: "errors.roleSearchQuota" } });
    // A Staff account without the Test flag never searches.
    const staff = await performer("staff-only", { isStaff: true }, true);
    expect((await click(staff, 1)).ok).toBe(false);
  });

  it("a queued search that never ran uses nothing when the period resets, and is counted when it starts", async () => {
    const id = await performer("period", { accountStatus: "TEST" }, true);
    expect((await click(id, 1)).ok).toBe(true);
    // 31 days later, still queued: nothing used, the place still held.
    const old = new Date(Date.now() - 31 * 24 * 3600_000);
    await prisma.user.update({ where: { id }, data: { searchPeriodStartedAt: old } });
    await prisma.roleSearchRequest.updateMany({ where: { userId: id }, data: { createdAt: old, scheduledFor: old } });
    expect(await getRoleSearchQuota(id)).toMatchObject({ used: 0, held: 1, remaining: 4, resetsAt: null });
    await setRun(true);
    await claim();
    expect(await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: id } })).toMatchObject({ status: "running" });
    // It started now, so it opened a new period and counts in it.
    expect(await getRoleSearchQuota(id)).toMatchObject({ used: 1, held: 1, remaining: 4 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).searchPeriodStartedAt!.getTime()).toBeGreaterThan(old.getTime());
  });
});
