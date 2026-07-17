import { prisma } from "@/lib/db";
import { b2bLimit } from "@/domain/pricing";
import type { PlanB2B } from "@/domain/enums";

export type Metric = "activeProjects" | "filteredCandidatures";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Increment a monthly usage counter (e.g. filtered candidatures). */
export async function incrementUsage(
  subjectId: string,
  metric: Metric,
  by = 1
): Promise<void> {
  const period = currentPeriod();
  await prisma.usageCounter.upsert({
    where: { subjectId_metric_period: { subjectId, metric, period } },
    create: { subjectId, metric, period, count: by },
    update: { count: { increment: by } },
  });
}

export interface QuotaState {
  used: number;
  limit: number | null; // null = unlimited
  allowed: boolean;
  remaining: number | null;
}

/** Monthly quota state for a metric (filteredCandidatures) under a B2B plan. */
export async function monthlyQuota(
  orgId: string,
  plan: PlanB2B,
  metric: "filteredCandidatures"
): Promise<QuotaState> {
  const limit = b2bLimit(plan, "filteredCandidaturesPerMonth");
  const counter = await prisma.usageCounter.findUnique({
    where: {
      subjectId_metric_period: {
        subjectId: orgId,
        metric,
        period: currentPeriod(),
      },
    },
  });
  const used = counter?.count ?? 0;
  return {
    used,
    limit,
    allowed: limit == null || used < limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
  };
}

/** Active-projects quota state for a B2B plan. */
export async function activeProjectsQuota(
  orgId: string,
  plan: PlanB2B
): Promise<QuotaState> {
  const limit = b2bLimit(plan, "activeProjects");
  const used = await prisma.project.count({
    where: { organizationId: orgId, status: { in: ["OPEN", "SHORTLISTING"] } },
  });
  return {
    used,
    limit,
    allowed: limit == null || used < limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
  };
}
