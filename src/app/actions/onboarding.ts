"use server";

import { err, zodError, type ActionError } from "@/domain/action-result";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recomputeCompleteness } from "@/lib/completeness";
import {
  IdentityStep,
  MandatStep,
  ProfileBasicsStep,
} from "@/domain/onboarding";
import { isMinorOn } from "@/domain/age";
import { MANDATE, canReceiveOpportunities, mandatSignBlocker } from "@/domain/mandat";
import { nextSetupStep, type SetupStep } from "@/domain/setup";
import { parseJson, PhysicalTraits, toJson, withHeight } from "@/domain/json";

export type StepResult = { ok: boolean; error?: ActionError };

async function requireTalentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return redirect({ href: "/connexion", locale: await getLocale() });
  }
  return session.user.id;
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
    // Under 18 surfaces here as errors.adultsOnly (see BirthDateInput).
    return { ok: false, error: zodError(parsed.error) };
  }
  // After signing, identity changes go through the profile editor, which
  // audits birth date edits. This signup step must not bypass that.
  const mandat = await prisma.mandat.findFirst({
    where: { profile: { userId } },
    select: { status: true, signedAt: true },
  });
  if (canReceiveOpportunities(mandat)) {
    return { ok: false, error: err("errors.mandatAlreadySigned") };
  }
  const d = parsed.data;
  await prisma.artistProfile.update({
    where: { userId },
    data: {
      stageName: d.stageName,
      // Signup no longer asks for these two. Left undefined, Prisma keeps
      // what is stored instead of nulling it.
      legalName: d.legalName === undefined ? undefined : d.legalName || null,
      phone: d.phone === undefined ? undefined : d.phone || null,
      city: d.city || null,
      birthDate: new Date(d.birthDate),
      isMinor: isMinorOn(d.birthDate),
    },
  });
  return { ok: true };
}

/**
 * Signup step 2: specialties plus an optional height. One transaction, so a
 * failure cannot leave the talent with their specialties deleted. The height
 * is merged into the existing physical JSON rather than replacing it.
 */
export async function saveProfileBasics(input: unknown): Promise<StepResult> {
  const userId = await requireTalentUserId();
  const parsed = ProfileBasicsStep.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: zodError(parsed.error) };
  }
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    include: { specialties: true },
  });
  if (!profile) return { ok: false, error: err("errors.profileNotFound") };
  const d = parsed.data;
  const levels = new Map(profile.specialties.map((s) => [s.kind, s.level]));
  const physical = withHeight(parseJson(PhysicalTraits, profile.physical), d.height);
  await prisma.$transaction([
    prisma.specialty.deleteMany({ where: { profileId: profile.id } }),
    prisma.specialty.createMany({
      data: d.specialties.map((kind) => ({
        profileId: profile.id,
        kind,
        level: levels.get(kind) ?? "BEGINNER",
      })),
    }),
    prisma.artistProfile.update({
      where: { id: profile.id },
      data: { physical: toJson(physical) },
    }),
  ]);
  return { ok: true };
}

export type CompleteOnboardingResult =
  | {
      ok: true;
      /** The first unfinished setup step, or null when the basics are saved. */
      nextStep: SetupStep | null;
      /** Where to go next, without a locale prefix (for @/i18n/navigation). */
      path: string;
    }
  | { ok: false; error: ActionError };

/**
 * The last button of the sign-up wizard during the beta: "Continue to my
 * profile". It records nothing about a representation agreement.
 *
 * When the basics are saved (see src/domain/setup.ts) it makes sure the Free
 * plan row exists and stamps onboardingCompletedAt, once. The first time, the
 * answer points at the profile with the tutorial; later calls point at the
 * dashboard. When a step is still missing it changes nothing and names the
 * step, so the dashboard can offer to resume it.
 *
 * The profile stays DRAFT. ACTIVE is what puts a profile in front of casting
 * teams, and that still takes an accepted agreement.
 */
export async function completeBetaOnboarding(): Promise<CompleteOnboardingResult> {
  const userId = await requireTalentUserId();
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      legalFirstName: true,
      legalLastName: true,
      legalName: true,
      birthDate: true,
      gender: true,
    },
  });
  const nextStep = nextSetupStep(
    profile
  );
  if (nextStep || !profile) {
    return { ok: true, nextStep: nextStep ?? "identity", path: "/talents/app" };
  }

  const now = new Date();
  const firstTime = await prisma.$transaction(async (tx) => {
    // A separate, optional service: starts on Free (no charge, no card).
    await tx.subscription.upsert({
      where: { subjectId: userId },
      create: {
        subjectType: "ARTIST",
        subjectId: userId,
        plan: "FREE",
        priceCents: 0,
        commissionRate: 0.1,
      },
      update: {},
    });
    // Only the request that finds the stamp empty writes it, so a double
    // click produces one audit entry and one first-run screen.
    const { count } = await tx.user.updateMany({
      where: { id: userId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: now },
    });
    if (count === 1) {
      await audit(
        {
          actorUserId: userId,
          action: "onboarding.complete",
          resourceType: "ArtistProfile",
          resourceId: profile.id,
          after: { at: now, mandate: "none" },
        },
        tx
      );
    }
    return count === 1;
  });

  try {
    await recomputeCompleteness(profile.id);
  } catch (error) {
    console.error("[onboarding] completeness refresh failed", error);
  }

  return {
    ok: true,
    nextStep: null,
    path: firstTime ? "/talents/app?welcome=1" : "/talents/app",
  };
}

/**
 * Sign the Mandat (free legal representation) and activate the Free plan.
 * The Mandat is created WITHOUT any reference to a paid plan; the Free
 * Subscription is a separate row. This is the load-bearing separation.
 *
 * Closed during the beta: with no approved agreement version (MANDATE in
 * src/domain/mandat.ts) it refuses before reading anything, and no row is
 * written. Once a version is approved, the acceptance is recorded against it.
 *
 * The signature is the legal act, so the whole profile is re-checked here
 * (mandatSignBlocker) rather than trusting that the wizard's earlier steps
 * ran. On failure it returns a translation key; on success it redirects.
 */
export async function signMandat(input: unknown): Promise<StepResult> {
  const userId = await requireTalentUserId();
  const version = MANDATE.approvedVersion;
  if (!version) return { ok: false, error: err("errors.mandatUnavailable") };
  const accepted = MandatStep.safeParse(input);
  if (!accepted.success) {
    return { ok: false, error: zodError(accepted.error) };
  }
  const profile = await prisma.artistProfile.findUnique({
    where: { userId },
    include: { mandat: true, _count: { select: { specialties: true } } },
  });
  const blocker = mandatSignBlocker(
    profile && {
      stageName: profile.stageName,
      birthDate: profile.birthDate,
      isMinor: profile.isMinor,
      specialtiesCount: profile._count.specialties,
      mandat: profile.mandat,
    }
  );
  if (blocker || !profile) {
    return { ok: false, error: err(blocker ?? "errors.profileNotFound") };
  }

  const hdrs = await headers();
  // x-real-ip is set by the platform; the first x-forwarded-for hop is
  // whatever the client chose to send.
  const ip =
    hdrs.get("x-real-ip") ??
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const signedAt = new Date();
  const signature = {
    status: "ACTIVE",
    signedAt,
    signatureIp: ip,
    documentVersion: version,
  };
  const existing = profile.mandat;

  // The mandate, the Free plan, the profile status and the audit entry are
  // written together or not at all. A failure part way used to leave a signed
  // mandate with no audit entry and a DRAFT profile, which the check above
  // then refused to sign again; now it leaves nothing, and a retry works.
  const mandatId = await prisma.$transaction(async (tx) => {
    // Each write applies only to a mandate nobody has signed yet. A second
    // request for the same talent waits for the first to commit, then writes
    // nothing and is told the mandate is signed.
    let id: string | undefined;
    if (existing) {
      // A REVOKED mandate, or a row that was never signed.
      const { count } = await tx.mandat.updateMany({
        where: {
          id: existing.id,
          OR: [{ status: { not: "ACTIVE" } }, { signedAt: null }],
        },
        data: { ...signature, revokedAt: null },
      });
      if (count === 1) id = existing.id;
    } else {
      // INSERT ... ON CONFLICT DO NOTHING on the unique profileId.
      const [created] = await tx.mandat.createManyAndReturn({
        data: [{ profileId: profile.id, ...signature }],
        skipDuplicates: true,
        select: { id: true },
      });
      id = created?.id;
    }
    if (!id) return null;

    // Separate, optional service: starts on Free (no charge, no card).
    await tx.subscription.upsert({
      where: { subjectId: userId },
      create: {
        subjectType: "ARTIST",
        subjectId: userId,
        plan: "FREE",
        priceCents: 0,
        commissionRate: 0.1,
      },
      update: {},
    });

    await tx.artistProfile.update({
      where: { id: profile.id },
      data: { status: "ACTIVE" },
    });

    // The redirect below is the first-run screen; stamp it as served.
    await tx.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: signedAt },
    });

    await audit(
      {
        actorUserId: userId,
        action: "mandat.sign",
        resourceType: "Mandat",
        resourceId: id,
        after: { signedAt, ip, documentVersion: version },
      },
      tx
    );
    return id;
  });
  if (!mandatId) return { ok: false, error: err("errors.mandatAlreadySigned") };

  // After the commit: the score is display data, outside the legal act, and
  // every later profile save recomputes it. The signature stands either way.
  try {
    await recomputeCompleteness(profile.id);
  } catch (error) {
    console.error("[onboarding] completeness refresh after signing failed", error);
  }

  // First sign-in lands on profile completeness, with the tutorial; every
  // later one goes to the dashboard (postAuthHome).
  return redirect({
    href: { pathname: "/talents/app", query: { welcome: "1" } },
    locale: await getLocale(),
  });
}

/**
 * Mark the first-run screen as seen for the signed-in user. Signing the
 * mandate (talents) and finishing the wizard (casting) already do it; this is
 * for the tutorial's Close button, so a replay never routes there again.
 * Safe to call any number of times.
 */
export async function completeFirstRun(): Promise<{ ok: true } | { ok: false; error: ActionError }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: err("errors.unauthorized") };
  await prisma.user.updateMany({
    where: { id: session.user.id, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: new Date() },
  });
  return { ok: true };
}
