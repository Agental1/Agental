"use server";

import { zodError, type ActionError } from "@/domain/action-result";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { B2C_PLANS } from "@/domain/pricing";
import {
  IdentityStep,
  PhysicalStep,
  SpecialtiesStep,
} from "@/domain/onboarding";
import { toJson } from "@/domain/json";

export type StepResult = { ok: boolean; error?: ActionError };

async function requireTalentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return redirect({ href: "/connexion", locale: await getLocale() });
  }
  return session.user.id;
}

function isMinorFrom(birthDate?: string): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const eighteen = new Date(d);
  eighteen.setFullYear(eighteen.getFullYear() + 18);
  return eighteen > new Date();
}

/** Idempotently ensure the signed-in talent has a profile row. */
export async function ensureArtistProfile(): Promise<{ id: string }> {
  const userId = await requireTalentUserId();
  const existing = await prisma.artistProfile.findUnique({ where: { userId } });
  if (existing) return { id: existing.id };
  const created = await prisma.artistProfile.create({
    data: { userId, stageName: "" },
  });
  return { id: created.id };
}

export async function saveIdentity(input: unknown): Promise<StepResult> {
  const userId = await requireTalentUserId();
  const parsed = IdentityStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: zodError(parsed.error) };
  }
  const d = parsed.data;
  await prisma.artistProfile.update({
    where: { userId },
    data: {
      stageName: d.stageName,
      legalName: d.legalName || null,
      phone: d.phone || null,
      city: d.city || null,
      birthDate: d.birthDate ? new Date(d.birthDate) : null,
      isMinor: isMinorFrom(d.birthDate),
    },
  });
  return { ok: true };
}

export async function savePhysical(input: unknown): Promise<StepResult> {
  const userId = await requireTalentUserId();
  const parsed = PhysicalStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: zodError(parsed.error) };
  }
  await prisma.artistProfile.update({
    where: { userId },
    data: { physical: toJson(parsed.data) },
  });
  return { ok: true };
}

export async function saveSpecialties(input: unknown): Promise<StepResult> {
  const userId = await requireTalentUserId();
  const parsed = SpecialtiesStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: zodError(parsed.error) };
  }
  const profile = await prisma.artistProfile.findUniqueOrThrow({
    where: { userId },
  });
  const d = parsed.data;
  await prisma.$transaction([
    prisma.specialty.deleteMany({ where: { profileId: profile.id } }),
    prisma.specialty.createMany({
      data: d.specialties.map((s) => ({
        profileId: profile.id,
        kind: s.kind,
        level: s.level,
      })),
    }),
    prisma.artistProfile.update({
      where: { id: profile.id },
      data: {
        mobilityCountries: toJson(d.mobilityCountries),
        minRateCents:
          d.minRateEuros != null ? Math.round(d.minRateEuros * 100) : null,
      },
    }),
  ]);
  return { ok: true };
}

/**
 * Sign the Mandat (free legal representation) and activate the Free plan.
 * The Mandat is created WITHOUT any reference to a paid plan; the Free
 * Subscription is a separate row. This is the load-bearing separation.
 */
export async function signMandat(): Promise<void> {
  const userId = await requireTalentUserId();
  const profile = await prisma.artistProfile.findUniqueOrThrow({
    where: { userId },
  });
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";

  const mandat = await prisma.mandat.upsert({
    where: { profileId: profile.id },
    create: {
      profileId: profile.id,
      status: "ACTIVE",
      signedAt: new Date(),
      signatureIp: ip,
    },
    update: { status: "ACTIVE", signedAt: new Date(), signatureIp: ip },
  });

  // Separate, optional service — starts on Free (no charge, no card).
  await prisma.subscription.upsert({
    where: { subjectId: userId },
    create: {
      subjectType: "ARTIST",
      subjectId: userId,
      plan: B2C_PLANS.FREE.plan,
      priceCents: B2C_PLANS.FREE.priceCents,
      commissionRate: B2C_PLANS.FREE.commissionRate,
    },
    update: {},
  });

  const score = await computeCompleteness(profile.id);
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { status: "ACTIVE", completenessScore: score },
  });

  await audit({
    actorUserId: userId,
    action: "mandat.sign",
    resourceType: "Mandat",
    resourceId: mandat.id,
    after: { signedAt: mandat.signedAt, ip },
  });

  return redirect({ href: "/talents/app", locale: await getLocale() });
}

async function computeCompleteness(profileId: string): Promise<number> {
  const p = await prisma.artistProfile.findUniqueOrThrow({
    where: { id: profileId },
    include: { specialties: true, media: true },
  });
  let score = 0;
  if (p.stageName) score += 20;
  if (p.birthDate) score += 10;
  if (p.city) score += 10;
  if (p.physical && p.physical !== "{}") score += 20;
  if (p.specialties.length > 0) score += 25;
  if (p.media.length > 0) score += 15;
  return Math.min(100, score);
}
