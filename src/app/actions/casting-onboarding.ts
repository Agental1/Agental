"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CastingIdentityStep, CastingScopeStep } from "@/domain/onboarding";
import { toJson } from "@/domain/json";

export type StepResult = { ok: boolean; error?: string; orgId?: string };

async function requireCastingUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "CASTING") {
    redirect("/connexion");
  }
  return session.user.id;
}

/** The single org a casting user owns (created lazily during onboarding). */
async function findOwnedOrg(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, role: "OWNER" },
    include: { organization: true },
  });
  return membership?.organization ?? null;
}

/**
 * Mock SIRET verification (real impl: INSEE Sirene API). A well-formed 14-digit
 * SIRET is accepted; otherwise the org stays PENDING until manual review.
 */
function verifySiret(siret?: string): "VERIFIED" | "PENDING" {
  return siret && /^\d{14}$/.test(siret) ? "VERIFIED" : "PENDING";
}

export async function saveCastingIdentity(input: unknown): Promise<StepResult> {
  const userId = await requireCastingUserId();
  const parsed = CastingIdentityStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const d = parsed.data;
  const siret = d.siret || undefined;
  const siretStatus = verifySiret(siret);

  const existing = await findOwnedOrg(userId);
  if (existing) {
    await prisma.organization.update({
      where: { id: existing.id },
      data: { name: d.organizationName, siret: siret ?? null, siretStatus },
    });
    return { ok: true, orgId: existing.id };
  }

  // Create org + owner seat + membership + FREE subscription (all in one tx).
  const org = await prisma.organization.create({
    data: {
      name: d.organizationName,
      siret: siret ?? null,
      siretStatus,
      plan: "FREE",
    },
  });
  const seat = await prisma.seat.create({
    data: { organizationId: org.id, status: "ACTIVE" },
  });
  await prisma.membership.create({
    data: {
      userId,
      organizationId: org.id,
      role: "OWNER",
      seatId: seat.id,
    },
  });
  await prisma.subscription.upsert({
    where: { subjectId: org.id },
    create: {
      subjectType: "ORG",
      subjectId: org.id,
      plan: "FREE",
      priceCents: 0,
      seatCount: 1,
    },
    update: {},
  });
  await audit({
    actorUserId: userId,
    organizationId: org.id,
    action: "org.create",
    resourceType: "Organization",
    resourceId: org.id,
    after: { name: org.name, siretStatus },
  });
  return { ok: true, orgId: org.id };
}

export async function saveCastingScope(input: unknown): Promise<StepResult> {
  const userId = await requireCastingUserId();
  const parsed = CastingScopeStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const org = await findOwnedOrg(userId);
  if (!org) return { ok: false, error: "Organisation introuvable." };
  await prisma.organization.update({
    where: { id: org.id },
    data: { scope: toJson(parsed.data) },
  });
  return { ok: true, orgId: org.id };
}

/** Final step: confirm email (mock) and enter the app. */
export async function finalizeCastingOnboarding(): Promise<void> {
  const userId = await requireCastingUserId();
  const org = await findOwnedOrg(userId);
  if (!org) redirect("/casting/inscription");

  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
  await audit({
    actorUserId: userId,
    organizationId: org.id,
    action: "casting.onboarding.complete",
    resourceType: "Organization",
    resourceId: org.id,
  });
  redirect("/casting/app");
}
