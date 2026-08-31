"use server";

import { err, type ActionError } from "@/domain/action-result";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export type MinorResult = { ok: boolean; error?: ActionError };

async function ownerCtx() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") return null;
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  return membership
    ? { userId: session.user.id, orgId: membership.organizationId }
    : null;
}

/** Ensure a MinorCase exists for a shortlisted minor on this project. */
export async function openMinorCase(
  candidatureId: string
): Promise<MinorResult> {
  const ctx = await ownerCtx();
  if (!ctx) return { ok: false, error: err("errors.unauthorized") };
  const cand = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: { project: true, artistProfile: true },
  });
  if (!cand?.artistProfile || cand.project.organizationId !== ctx.orgId) {
    return { ok: false, error: err("errors.notFound") };
  }
  const existing = await prisma.minorCase.findUnique({
    where: { artistProfileId: cand.artistProfile.id },
  });
  if (!existing) {
    const mc = await prisma.minorCase.create({
      data: {
        artistProfileId: cand.artistProfile.id,
        projectId: cand.projectId,
        state: "DOCS_PENDING",
      },
    });
    await audit({
      actorUserId: ctx.userId,
      organizationId: ctx.orgId,
      action: "minor.open",
      resourceType: "MinorCase",
      resourceId: mc.id,
    });
  }
  revalidatePath(`/casting/app/projets/${cand.projectId}/talent/${candidatureId}`);
  return { ok: true };
}

const STEPS: Record<string, Partial<Record<string, unknown>>> = {
  requestAuth: { prefectoralAuthStatus: "REQUESTED" },
  grantAuth: { prefectoralAuthStatus: "GRANTED" },
  confirmParental: { parentalPresence: true },
  holdEscrow: { escrowStatus: "HELD" },
};

export async function advanceMinorCase(
  minorCaseId: string,
  step: keyof typeof STEPS
): Promise<MinorResult> {
  const ctx = await ownerCtx();
  if (!ctx) return { ok: false, error: err("errors.unauthorized") };
  const mc = await prisma.minorCase.findUnique({ where: { id: minorCaseId } });
  if (!mc) return { ok: false, error: err("errors.caseNotFound") };

  const data = { ...STEPS[step] } as Record<string, unknown>;
  const updated = await prisma.minorCase.update({
    where: { id: minorCaseId },
    data,
  });

  // Ready when authorization granted, parental presence confirmed, escrow held.
  const ready =
    updated.prefectoralAuthStatus === "GRANTED" &&
    updated.parentalPresence &&
    updated.escrowStatus === "HELD";
  if (ready && updated.state !== "READY") {
    await prisma.minorCase.update({
      where: { id: minorCaseId },
      data: { state: "READY" },
    });
  }

  await audit({
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    action: `minor.${step}`,
    resourceType: "MinorCase",
    resourceId: minorCaseId,
    after: data,
  });
  revalidatePath("/casting/app/projets", "layout");
  return { ok: true };
}
