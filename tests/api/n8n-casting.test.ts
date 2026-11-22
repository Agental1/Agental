import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";

/**
 * The app side of the n8n "Beta V2" casting link (round 7, Part C), against
 * the local database: the secret gates both routes, a claim is atomic and
 * re-checks eligibility, a retried claim or completion writes nothing twice,
 * a completion from another execution is refused, model output is checked,
 * and results land as drafts for the performer's review.
 */
const P = "test-n8ncast-";
const SECRET = "test-n8n-secret-with-enough-length-0123";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const claimRoute = await import("@/app/api/n8n/casting/claim/route");
const completeRoute = await import("@/app/api/n8n/casting/complete/route");
const { claimCastingJobs, queueScheduledSearches } = await import("@/lib/n8n/casting");

const call = (route: { POST: (r: Request) => Promise<Response> }, body: unknown, auth = `Bearer ${SECRET}`) =>
  route.POST(
    new Request("https://app.test/api/n8n/casting", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify(body),
    })
  );

const role = (n: number, over: Record<string, unknown> = {}) => ({
  rank: n,
  roleKey: `project ${n}|role ${n}`,
  project: `Project ${n}`,
  role: `Role ${n}`,
  sourceUrl: `https://www.backstage.com/casting/sample-${n}/`,
  city: "New York",
  remote: false,
  score: 60,
  reasons: ["Matches home market"],
  review: ["Confirm the submission deadline"],
  draft: { subject: `Application for Role ${n} | Project ${n}`, body: "Hello,\n\n[Your name]", route: "email" },
  ...over,
});

let ok: string;
let thin = "";
let later: string;
let auto: string;
let parked: { id: string; status: string; startedAt: Date | null; claimedBy: string | null }[] = [];

describe.skipIf(!local)("n8n casting link", () => {
  beforeAll(async () => {
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    // Nothing else may sit in the queue for these tests; other rows are parked and put back after.
    parked = await prisma.roleSearchRequest.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true, status: true, startedAt: true, claimedBy: true } });
    await prisma.roleSearchRequest.updateMany({ where: { id: { in: parked.map((r) => r.id) } }, data: { status: "parked_by_test" } });
    const make = (name: string, over: Record<string, unknown> = {}) =>
      prisma.user
        .create({
          data: {
            email: `${P}${name}@test.local`,
            name,
            kind: "TALENT",
            emailVerified: new Date(),
            accountStatus: "TEST",
            agentsOptInAt: new Date(),
            artistProfile: {
              create: { stageName: name, birthDate: new Date("1990-01-01T00:00:00Z"), mobilityCountries: '["US"]', ...completeProfile(`${P}${name}`) },
            },
            ...over,
          },
        })
        .then((u) => u.id);
    ok = await make("ok");
    later = await make("later");
    auto = await make("auto", { agentsOptInAt: null, autoSearchOptIn: true });
    await prisma.roleSearchRequest.create({ data: { userId: ok, plan: "FREE", periodKey: "p1", seq: 1, status: "queued" } });
    await prisma.roleSearchRequest.create({ data: { userId: later, plan: "FREE", periodKey: "p1", seq: 1, status: "queued" } });
    thin = await make("thin");
    await prisma.roleSearchRequest.create({ data: { userId: thin, plan: "FREE", periodKey: "p1", seq: 1, status: "queued" } });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const r of parked) {
      await prisma.roleSearchRequest.update({ where: { id: r.id }, data: { status: r.status, startedAt: r.startedAt, claimedBy: r.claimedBy } });
    }
    const rows = await prisma.roleSearchRequest.findMany({ where: { user: { email: { startsWith: P } } }, select: { id: true } });
    await prisma.workflowRun.deleteMany({ where: { subjectRef: { in: rows.map((r) => r.id) } } });
    const briefs = await prisma.brief.findMany({ where: { source: "n8n-beta-v2", title: { startsWith: "Project " } }, select: { id: true } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } }); // profiles, drafts, rows cascade
    await prisma.brief.deleteMany({ where: { id: { in: briefs.map((b) => b.id) } } });
  });

  it("is off without the secret, and refuses a wrong one", async () => {
    vi.stubEnv("N8N_SHARED_SECRET", "");
    expect((await call(claimRoute, { executionId: "e0" })).status).toBe(404);
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    expect((await call(claimRoute, { executionId: "e0" }, "Bearer nope")).status).toBe(401);
    expect((await call(completeRoute, { executionId: "e0", results: [] }, "")).status).toBe(401);
    expect((await call(claimRoute, { executionId: "bad id!" })).status).toBe(400);
  });

  it("cancels a queued search whose account lost eligibility, and claims the other with minimum data", async () => {
    await prisma.user.update({ where: { id: later }, data: { accountStatus: "SPAM" } });
    // A profile that dropped below 100% since the click is canceled too.
    const thinProfile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: thin } });
    await prisma.media.deleteMany({ where: { profileId: thinProfile.id, category: "SELF" } });
    const res = await call(claimRoute, { limit: 10, executionId: "exec1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    const mine = body.jobs.filter((j: { profile: { id: string } }) => j.profile.id);
    const okProfile = await prisma.artistProfile.findUniqueOrThrow({ where: { userId: ok } });
    const job = mine.find((j: { profile: { id: string } }) => j.profile.id === okProfile.id);
    expect(job.profile).toMatchObject({ country: "US", confirmed18Plus: true, city: "New York" });
    expect(JSON.stringify(job)).not.toMatch(/test\.local|birth|stageName|"name"/);
    const okRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: ok } });
    expect(okRow).toMatchObject({ status: "running", claimedBy: "exec1" });
    const lateRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: later } });
    expect(lateRow).toMatchObject({ status: "canceled", error: "ineligible at claim" });
    const thinRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: thin } });
    expect(thinRow).toMatchObject({ status: "canceled", error: "ineligible at claim" });
  });

  it("gives a retried claim the same rows, and another execution nothing already held", async () => {
    const again = await claimCastingJobs({ limit: 10, executionId: "exec1" });
    const okRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: ok } });
    expect(again.jobs.map((j) => j.requestId)).toContain(okRow.id);
    const other = await claimCastingJobs({ limit: 10, executionId: "exec2" });
    expect(other.jobs.map((j) => j.requestId)).not.toContain(okRow.id);
  });

  it("never claims a search before its scheduled start (round 8b)", async () => {
    const okRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: ok } });
    const later6h = await prisma.roleSearchRequest.create({
      data: {
        userId: ok,
        plan: okRow.plan,
        periodKey: okRow.periodKey,
        seq: 99,
        clientKey: "k-later-6h",
        status: "queued",
        scheduledFor: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });
    const res = await claimCastingJobs({ limit: 10, executionId: "exec3" });
    expect(res.jobs.map((j) => j.requestId)).not.toContain(later6h.id);
    expect((await prisma.roleSearchRequest.findUniqueOrThrow({ where: { id: later6h.id } })).status).toBe("queued");
    await prisma.roleSearchRequest.delete({ where: { id: later6h.id } });
  });

  it("refuses a completion from an execution that did not claim the row", async () => {
    const okRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: ok } });
    const res = await call(completeRoute, { executionId: "exec2", results: [{ requestId: okRow.id, status: "completed", roles: [role(1)] }] });
    expect((await res.json()).results[0].outcome).toBe("not_claimed");
    expect(await prisma.applicationDraft.count({ where: { profile: { userId: ok } } })).toBe(0);
  });

  it("stores checked roles as drafts once; a retry writes nothing", async () => {
    const okRow = await prisma.roleSearchRequest.findFirstOrThrow({ where: { userId: ok } });
    const payload = {
      executionId: "exec1",
      sampleOnly: false,
      results: [
        {
          requestId: okRow.id,
          profileId: "ignored",
          status: "completed",
          roles: [
            role(1),
            role(2),
            role(3, { sourceUrl: "http://www.backstage.com/x" }),
            role(4, { project: "" }),
            role(5, { sourceUrl: "https://evil.example/casting" }),
            role(6, { sourceUrl: "https://user@www.backstage.com/x" }),
            "junk",
          ],
        },
      ],
    };
    const first = await (await call(completeRoute, payload)).json();
    expect(first.results[0]).toEqual({ requestId: okRow.id, outcome: "done", drafts: 2 });
    const second = await (await call(completeRoute, payload)).json();
    expect(second.results[0].outcome).toBe("already_recorded");
    const drafts = await prisma.applicationDraft.findMany({ where: { profile: { userId: ok } }, include: { brief: true } });
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.status === "DRAFT" && d.brief.source === "n8n-beta-v2")).toBe(true);
    expect(drafts.map((d) => d.brief.sourceRef).sort()).toEqual([role(1).sourceUrl, role(2).sourceUrl].sort());
    expect(await prisma.roleSearchRequest.findUniqueOrThrow({ where: { id: okRow.id } })).toMatchObject({ status: "done" });
    expect(await prisma.workflowRun.count({ where: { subjectRef: okRow.id } })).toBe(1);
  });

  it("fails a claim that never completed after 30 minutes, which gives the search back", async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000);
    const id = (await prisma.roleSearchRequest.create({ data: { userId: ok, plan: "FREE", periodKey: "p1", seq: 9, status: "running", claimedBy: "lost", startedAt: old } })).id;
    await claimCastingJobs({ limit: 1, executionId: "exec9" });
    expect(await prisma.roleSearchRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "failed", error: "timed out" });
  });

  it("records a source failure as failed, with a short reason", async () => {
    const id = (await prisma.roleSearchRequest.create({ data: { userId: ok, plan: "FREE", periodKey: "p1", seq: 2, status: "running", claimedBy: "exec3" } })).id;
    const res = await (await call(completeRoute, { executionId: "exec3", results: [{ requestId: id, status: "perplexity_unavailable <b>", roles: [] }] })).json();
    expect(res.results[0].outcome).toBe("failed");
    expect(await prisma.roleSearchRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "failed", error: "perplexity_unavailable b" });
  });

  it("queues one scheduled search per six-hour window for an opted-in performer", async () => {
    const inWindow = { userId: auto, clientKey: { startsWith: "auto6h_" } };
    const before = await prisma.roleSearchRequest.count({ where: inWindow });
    expect(await queueScheduledSearches(new Date("2027-01-01T01:00:00Z"), "staging")).toBeGreaterThanOrEqual(1);
    await queueScheduledSearches(new Date("2027-01-01T05:00:00Z"), "staging"); // same window
    expect(await prisma.roleSearchRequest.count({ where: inWindow })).toBe(before + 1);
    // A scheduled search never stamps the click opt-in.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: auto } })).agentsOptInAt).toBeNull();
    await prisma.user.update({ where: { id: auto }, data: { accountStatus: "UNREVIEWED" } });
    await queueScheduledSearches(new Date("2027-01-01T07:00:00Z"), "staging"); // next window, no longer eligible
    expect(await prisma.roleSearchRequest.count({ where: inWindow })).toBe(before + 1);
  });

});
