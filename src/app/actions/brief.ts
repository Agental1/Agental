"use server";

import { err, type ActionError } from "@/domain/action-result";
import { reconcileShortlist } from "@/domain/shortlist";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { buildBrief, type BriefAnswers } from "@/lib/ai/brief-assistant";
import {
  getScorer,
  ageFromBirthDate,
  type TalentFeatures,
} from "@/lib/ai/scorer";
import { b2bLimit } from "@/domain/pricing";
import { incrementUsage } from "@/lib/quotas";
import { parseJson, toJson, PhysicalTraits } from "@/domain/json";
import { z } from "zod";

export type BriefActionResult = { ok: boolean; error?: ActionError; upgrade?: boolean };

async function ownerOrg() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    include: { organization: true },
  });
  return membership
    ? { userId: session.user.id, org: membership.organization, membershipId: membership.id }
    : null;
}

/** Create a project from brief answers, then run the scorer to build the shortlist. */
export async function createBrief(answers: BriefAnswers): Promise<BriefActionResult> {
  const ctx = await ownerOrg();
  if (!ctx) return { ok: false, error: err("errors.unauthorized") };

  // Quota (B2B active projects).
  const limit = b2bLimit(ctx.org.plan as never, "activeProjects");
  if (limit != null) {
    const activeCount = await prisma.project.count({
      where: {
        organizationId: ctx.org.id,
        status: { in: ["OPEN", "SHORTLISTING"] },
      },
    });
    if (activeCount >= limit) {
      return {
        ok: false,
        upgrade: true,
        error: err("errors.quotaExceeded", { plan: ctx.org.plan, limit: limit ?? 0 }),
      };
    }
  }

  const brief = buildBrief(answers);
  const project = await prisma.project.create({
    data: {
      organizationId: ctx.org.id,
      createdById: ctx.membershipId,
      title: brief.title,
      status: "OPEN",
      roleSpec: toJson(brief.roleSpec),
      budgetCents: brief.budgetCents ?? null,
    },
  });
  await audit({
    actorUserId: ctx.userId,
    organizationId: ctx.org.id,
    action: "brief.create",
    resourceType: "Project",
    resourceId: project.id,
    after: { title: project.title },
  });

  await runShortlist(project.id);
  return redirect({ href: `/casting/app/projets/${project.id}`, locale: await getLocale() });
}

/** Score roster + external talents against the role and persist candidatures. */
export async function runShortlist(projectId: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  const roleSpec = parseJson(
    z.object({
      role: z.string().optional(),
      gender: z.string().optional(),
      ageMin: z.number().optional(),
      ageMax: z.number().optional(),
      accent: z.string().optional(),
      language: z.string().optional(),
      constraints: z.array(z.string()).default([]),
    }),
    project.roleSpec
  );

  const profiles = await prisma.artistProfile.findMany({
    where: { status: "ACTIVE" },
    include: { specialties: true },
  });
  const externals = await prisma.externalTalent.findMany();

  const features: TalentFeatures[] = [
    ...profiles.map((p) => {
      const phys = parseJson(PhysicalTraits, p.physical);
      return {
        talentId: p.id,
        source: "AGENTAL" as const,
        name: p.stageName,
        age: ageFromBirthDate(p.birthDate),
        city: p.city ?? undefined,
        languages: phys.languages,
        accents: phys.accents,
        specialties: p.specialties.map((s) => s.kind),
        minRateEuros: p.minRateCents ? p.minRateCents / 100 : undefined,
      };
    }),
    ...externals.map((e) => {
      const d = parseJson(
        z.object({
          city: z.string().optional(),
          accents: z.array(z.string()).default([]),
          minRate: z.number().optional(),
          age: z.number().optional(),
        }),
        e.data
      );
      return {
        talentId: e.id,
        source: "EXTERNAL" as const,
        name: e.name,
        age: d.age,
        city: d.city,
        languages: [],
        accents: d.accents,
        specialties: [],
        minRateEuros: d.minRate,
      };
    }),
  ];

  const scorer = await getScorer();
  const scored = (await scorer.score(roleSpec, features))
    .filter((r) => r.score >= 55) // the "90% filtered" — only relevant profiles
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // Re-running the matching used to `deleteMany` every candidature of the
  // project and recreate them from scratch, which silently destroyed the
  // casting director's work: shortlist statuses, the timeline and appliedAt all
  // went with it. A director who re-ran a brief lost every decision they had
  // made on it, with no warning and nothing to undo.
  //
  // There is no unique index on (projectId, talent) to upsert against, and
  // adding one would need a migration this change deliberately avoids, so the
  // reconciliation is done in code.
  //
  // The rule itself lives in domain/shortlist.ts so it can be unit-tested
  // without a database; see tests/domain/shortlist.test.ts.
  const existing = await prisma.candidature.findMany({
    where: { projectId },
    select: {
      id: true,
      artistProfileId: true,
      externalTalentId: true,
      status: true,
    },
  });

  const { stale, keep: priorByTalent } = reconcileShortlist(
    existing,
    scored.map((r) => r.talentId)
  );

  if (stale.length > 0) {
    // MatchScore cascades on delete (schema.prisma:300).
    await prisma.candidature.deleteMany({
      where: { id: { in: stale.map((c) => c.id) } },
    });
  }

  for (const r of scored) {
    const isAgental = r.source === "AGENTAL";
    const feat = features.find((f) => f.talentId === r.talentId)!;
    const estimatedRateCents = feat.minRateEuros ? feat.minRateEuros * 100 : null;
    const prior = priorByTalent.get(r.talentId);

    // status, timeline and appliedAt are deliberately NOT written on an
    // existing row: they are the director's, not the matcher's.
    const cand = prior
      ? await prisma.candidature.update({
          where: { id: prior.id },
          data: { estimatedRateCents },
        })
      : await prisma.candidature.create({
          data: {
            projectId,
            artistProfileId: isAgental ? r.talentId : null,
            externalTalentId: isAgental ? null : r.talentId,
            source: r.source,
            status: "SHORTLISTED",
            estimatedRateCents,
          },
        });

    await prisma.matchScore.upsert({
      where: { candidatureId: cand.id },
      create: {
        candidatureId: cand.id,
        score: r.score,
        reasons: toJson(r.reasons),
        factors: toJson(r.factors),
        diversityFlags: toJson(r.diversityFlags),
        scorerVersion: scorer.version,
      },
      update: {
        score: r.score,
        reasons: toJson(r.reasons),
        factors: toJson(r.factors),
        diversityFlags: toJson(r.diversityFlags),
        scorerVersion: scorer.version,
        computedAt: new Date(),
      },
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "SHORTLISTING" },
  });

  // Consume monthly "filtered candidatures" quota (all profiles reviewed).
  await incrementUsage(project.organizationId, "filteredCandidatures", features.length);
}

const NEXT_STATUS: Record<string, string> = {
  star: "STARRED",
  exclude: "EXCLUDED",
  selftape: "SELFTAPE_REQUESTED",
  invite: "INVITED",
  reset: "SHORTLISTED",
};

export async function actOnCandidature(
  candidatureId: string,
  action: keyof typeof NEXT_STATUS
): Promise<BriefActionResult> {
  const ctx = await ownerOrg();
  if (!ctx) return { ok: false, error: err("errors.unauthorized") };
  const cand = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: { project: true },
  });
  if (!cand || cand.project.organizationId !== ctx.org.id) {
    return { ok: false, error: err("errors.candidatureNotFound") };
  }
  const status = NEXT_STATUS[action];
  await prisma.candidature.update({
    where: { id: candidatureId },
    data: { status },
  });
  await audit({
    actorUserId: ctx.userId,
    organizationId: ctx.org.id,
    action: `candidature.${action}`,
    resourceType: "Candidature",
    resourceId: candidatureId,
    before: { status: cand.status },
    after: { status },
  });
  // Route pattern, not the one project's URL: revalidatePath matches the file
  // structure, so a literal path would have to be repeated per locale. This
  // invalidates every project page instead of one — a re-render nobody sees,
  // where the previous call matched no route at all and showed stale data.
  revalidatePath("/[locale]/casting/(space)/app/projets/[id]", "page");
  return { ok: true };
}
