import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { completeProfile } from "../helpers/complete-profile";

/**
 * Round 9, group 4, end to end against the local database with three
 * fictional performers (Basic, Pro, and one with no search left), as n8n
 * would call the app: claim hands over the minimum profile and the cost
 * ceiling; completion stores the full role description, the drafts, and the
 * cost per provider once; a retry changes nothing; a search over the ceiling
 * alerts the admins; a performer with no search left cannot queue one.
 */
const P = "test-r9cast-";
const SECRET = "test-n8n-secret-with-enough-length-r9-0123";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const claimRoute = await import("@/app/api/n8n/casting/claim/route");
const completeRoute = await import("@/app/api/n8n/casting/complete/route");
const { startRoleSearch } = await import("@/lib/role-search");

const call = async (route: { POST: (r: Request) => Promise<Response> }, body: unknown) => {
  const res = await route.POST(
    new Request("https://app.test/api/n8n/casting", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, json: await res.json() };
};

const role = (n: number) => ({
  rank: n,
  roleKey: `r9 project ${n}|lead ${n}`,
  project: `R9 Project ${n}`,
  role: `Lead ${n}`,
  sourceUrl: `https://www.backstage.com/casting/r9-sample-${n}/`,
  city: "Los Angeles",
  production: "Fictional Films",
  description: `A warm, funny lead for a short film (${n}). Self-tape of two scenes.`,
  startsOn: "2027-01-10",
  endsOn: "2027-01-14",
  pay: { paid: true, rateUsd: 250, text: "$250 a day" },
  union: "SAG-AFTRA",
  submission: { questions: ["Are you available Jan 10 to 14?"], videos: ["Slate and two scenes"] },
  draft: { subject: `Lead ${n}`, body: "Hello", route: "email" },
});

const ids: Record<string, string> = {};
let adminId = "";
let parked: { id: string; status: string }[] = [];

describe.skipIf(!local)("round 9: searches through n8n, three fictional performers", () => {
  beforeAll(async () => {
    vi.stubEnv("N8N_SHARED_SECRET", SECRET);
    vi.stubEnv("SEARCH_COST_CEILING_USD", "0.50");
    parked = await prisma.roleSearchRequest.findMany({ where: { status: { in: ["queued", "running"] } }, select: { id: true, status: true } });
    await prisma.roleSearchRequest.updateMany({ where: { id: { in: parked.map((r) => r.id) } }, data: { status: "parked_by_test" } });
    adminId = (await prisma.user.create({ data: { email: `${P}admin@test.local`, isAdmin: true, accountStatus: "STAFF" } })).id;
    for (const name of ["basic", "pro", "empty"]) {
      ids[name] = (
        await prisma.user.create({
          data: {
            email: `${P}${name}@test.local`,
            name: `Legal ${name}`,
            kind: "TALENT",
            emailVerified: new Date(),
            accountStatus: "TEST",
            agentsOptInAt: new Date(),
            artistProfile: {
              create: { stageName: `Fictional ${name}`, birthDate: new Date("1992-03-01T00:00:00Z"), mobilityCountries: '["US"]', ...completeProfile(`${P}${name}`) },
            },
          },
        })
      ).id;
    }
    await prisma.subscription.create({ data: { subjectType: "ARTIST", subjectId: ids.pro, plan: "PRO", status: "ACTIVE" } });
    await startRoleSearch(ids.basic, `${P}basic-1`, new Date(), "staging", false);
    await startRoleSearch(ids.pro, `${P}pro-1`, new Date(), "staging", false);
    // "empty" has used its 5 Basic searches already.
    for (let i = 1; i <= 5; i++) await startRoleSearch(ids.empty, `${P}empty-used-${i}`, new Date(), "staging", false);
    await prisma.roleSearchRequest.updateMany({ where: { userId: ids.empty }, data: { status: "done", completedAt: new Date() } });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    for (const r of parked) await prisma.roleSearchRequest.update({ where: { id: r.id }, data: { status: r.status } });
    const rows = await prisma.roleSearchRequest.findMany({ where: { user: { email: { startsWith: P } } }, select: { id: true } });
    await prisma.aiUsage.deleteMany({ where: { ref: { in: rows.map((r) => r.id) } } });
    await prisma.workflowRun.deleteMany({ where: { subjectRef: { in: rows.map((r) => r.id) } } });
    const briefs = await prisma.brief.findMany({ where: { title: { startsWith: "R9 Project " } }, select: { id: true } });
    await prisma.subscription.deleteMany({ where: { subjectId: ids.pro } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
    await prisma.brief.deleteMany({ where: { id: { in: briefs.map((b) => b.id) } } });
  });

  it("refuses a new search to the performer with none left", async () => {
    const res = await startRoleSearch(ids.empty, `${P}empty-1`, new Date(), "staging", false);
    expect(res).toMatchObject({ ok: false, reason: "quota_exhausted" });
  });

  it("claims the two queued searches with the minimum profile and the cost ceiling", async () => {
    const { status, json } = await call(claimRoute, { limit: 10, executionId: "r9exec1" });
    expect(status).toBe(200);
    expect(json.limits).toEqual({ costCeilingUsd: 0.5 });
    const mine = json.jobs.filter((j: { requestId: string }) => j.requestId);
    expect(mine).toHaveLength(2);
    const text = JSON.stringify(json);
    // Never the legal name, phone or email.
    expect(text).not.toContain("Legal ");
    expect(text).not.toContain("@test.local");
    expect(text).not.toMatch(/"phone"|"email"|"firstName"|"lastName"/);
  });

  it("stores the full description, drafts and cost once; a retry changes nothing", async () => {
    const running = await prisma.roleSearchRequest.findMany({ where: { userId: { in: [ids.basic, ids.pro] }, status: "running" }, select: { id: true, userId: true } });
    const basicReq = running.find((r) => r.userId === ids.basic)!.id;
    const proReq = running.find((r) => r.userId === ids.pro)!.id;
    const body = {
      executionId: "r9exec1",
      results: [
        {
          requestId: basicReq,
          status: "completed",
          roles: [role(1), role(2)],
          usage: [
            { provider: "openai", model: "gpt-x", inputTokens: 12000, outputTokens: 3000, requests: 4, costUsd: 0.06 },
            { provider: "perplexity", inputTokens: 8000, outputTokens: 2000, requests: 6, costUsd: 0.04 },
          ],
        },
        { requestId: proReq, status: "completed", roles: [role(3)], usage: [{ provider: "openai", inputTokens: 90000, outputTokens: 40000, requests: 30, costUsd: 0.9 }] },
      ],
    };
    const first = await call(completeRoute, body);
    expect(first.json.results).toEqual([
      { requestId: basicReq, outcome: "done", drafts: 2 },
      { requestId: proReq, outcome: "done", drafts: 1 },
    ]);
    const brief = await prisma.brief.findFirstOrThrow({ where: { title: "R9 Project 1" } });
    expect(brief).toMatchObject({ production: "Fictional Films", rateCents: 25000, paid: true, unionStatus: "SAG-AFTRA" });
    expect(brief.description).toContain("warm, funny lead");
    expect(brief.startsOn?.toISOString().slice(0, 10)).toBe("2027-01-10");
    const usage = await prisma.aiUsage.findMany({ where: { ref: basicReq } });
    expect(usage.map((u) => u.provider).sort()).toEqual(["openai", "perplexity"]);
    const run = await prisma.workflowRun.findUniqueOrThrow({ where: { idempotencyKey: `casting:${basicReq}` } });
    expect(run).toMatchObject({ costMicroUsd: 100000, modelCalls: 10 });

    const again = await call(completeRoute, body);
    expect(again.json.results.map((r: { outcome: string }) => r.outcome)).toEqual(["already_recorded", "already_recorded"]);
    expect(await prisma.aiUsage.count({ where: { ref: basicReq } })).toBe(2);
    expect(await prisma.applicationDraft.count({ where: { profile: { userId: ids.basic } } })).toBe(2);
  });

  it("alerts the admins once when a search went over its ceiling", async () => {
    const n = await prisma.notification.count({ where: { userId: adminId, kind: "ALERT", title: { contains: "cost ceiling" } } });
    expect(n).toBe(1);
  });
});
