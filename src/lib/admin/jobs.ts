import { prisma } from "@/lib/db";

/**
 * Applications and AI jobs for the admin portal (round 7, A4), with the
 * statuses as recorded. Server only; every caller checks currentAdminId().
 */

/** The four states staff read, from each table's own words. */
export type JobState = "queued" | "running" | "completed" | "failed" | "canceled";

export function searchState(status: string): JobState {
  if (status === "queued" || status === "running" || status === "failed" || status === "canceled") return status;
  if (status === "done") return "completed";
  return "failed";
}

export function runState(status: string): JobState {
  if (status === "PENDING") return "queued";
  if (status === "RUNNING") return "running";
  if (status === "SUCCEEDED") return "completed";
  return "failed"; // FAILED, DEAD, anything unknown
}

export function listWorkflowRuns(take = 100) {
  return prisma.workflowRun.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      subjectRef: true,
      lastError: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });
}

/** Application drafts (performer review) and casting-side candidatures. */
export async function listApplications(take = 100) {
  const [drafts, candidatures] = await Promise.all([
    prisma.applicationDraft.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        brief: { select: { title: true, roleName: true, source: true } },
        profile: { select: { stageName: true, user: { select: { id: true, email: true } } } },
      },
    }),
    prisma.candidature.findMany({
      orderBy: { appliedAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        source: true,
        appliedAt: true,
        project: { select: { title: true } },
        artistProfile: { select: { stageName: true, user: { select: { id: true, email: true } } } },
      },
    }),
  ]);
  return { drafts, candidatures };
}

/** Counts by state, for the hub. */
export async function jobCounts() {
  const [searches, runs] = await Promise.all([
    prisma.roleSearchRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.workflowRun.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const out: Record<JobState, number> = { queued: 0, running: 0, completed: 0, failed: 0, canceled: 0 };
  for (const g of searches) out[searchState(g.status)] += g._count._all;
  for (const g of runs) out[runState(g.status)] += g._count._all;
  return out;
}
