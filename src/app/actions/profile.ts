"use server";

import { err, zodError, type ActionError } from "@/domain/action-result";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { recomputeCompleteness } from "@/lib/completeness";
import { toJson } from "@/domain/json";
import { isMinorOn } from "@/domain/age";
import { audit } from "@/lib/audit";
import {
  ProfileIdentity,
  ProfilePhysical,
  ProfileSpecialties,
  AvailabilityInput,
} from "@/domain/profile";
import {
  ContentBoundariesInput,
  PreferencesInput,
  mergeContentBoundaries,
  mergePreferences,
  readContentBoundaries,
} from "@/domain/preferences";

export type SaveResult = { ok: boolean; error?: ActionError; completeness?: number };

async function requireProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
}

async function done(profileId: string): Promise<SaveResult> {
  const completeness = await recomputeCompleteness(profileId);
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, completeness };
}

export async function saveProfileIdentity(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = ProfileIdentity.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const birthDate = new Date(d.birthDate);
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      stageName: d.stageName,
      // The editor has no legal name field. Left undefined, Prisma keeps the
      // stored value; this save used to null it on every submit.
      legalName: d.legalName === undefined ? undefined : d.legalName || null,
      phone: d.phone === undefined ? undefined : d.phone || null,
      city: d.city || null,
      bio: d.bio || null,
      imdbUrl: d.imdbUrl,
      portfolioUrl: d.portfolioUrl,
      birthDate,
      isMinor: isMinorOn(d.birthDate),
    },
  });
  // The mandate was signed against the stored birth date, so any change to it
  // is traced.
  if (profile.birthDate?.getTime() !== birthDate.getTime()) {
    await audit({
      actorUserId: profile.userId,
      action: "profile.birthDate.change",
      resourceType: "ArtistProfile",
      resourceId: profile.id,
      before: { birthDate: profile.birthDate },
      after: { birthDate },
    });
  }
  return done(profile.id);
}

export async function saveProfilePhysical(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = ProfilePhysical.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { physical: toJson(parsed.data) },
  });
  return done(profile.id);
}

export async function saveProfileSpecialties(
  input: unknown
): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = ProfileSpecialties.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
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
        // Left out by the form: Prisma keeps what is stored.
        mobilityCountries:
          d.mobilityCountries === undefined
            ? undefined
            : toJson([...new Set(d.mobilityCountries)]),
        minRateCents:
          d.minRateEuros != null ? Math.round(d.minRateEuros * 100) : null,
      },
    }),
  ]);
  return done(profile.id);
}

/**
 * Save the Preferences form: the jobs a performer wants and can take. The
 * input is the whole form; a field left out, null or empty is stored as "no
 * answer". Content boundaries are a separate setting and pass through
 * untouched (see src/domain/preferences.ts).
 */
export async function savePreferences(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = PreferencesInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { preferences: toJson(mergePreferences(profile.preferences, parsed.data)) },
  });
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  return { ok: true };
}

/**
 * Save the performer's private content boundaries. Optional: `nudity: null`
 * clears the answer. Read back with readContentBoundaries, for the owner's own
 * screen only; no casting-side query selects it.
 *
 * The audit entry records that the setting changed and whether an answer is
 * now on file, never the answer itself.
 */
export async function saveContentBoundaries(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = ContentBoundariesInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  const before = readContentBoundaries(profile.preferences);
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      preferences: toJson(mergeContentBoundaries(profile.preferences, parsed.data)),
    },
  });
  if (before.nudity !== parsed.data.nudity) {
    await audit({
      actorUserId: profile.userId,
      action: "profile.contentBoundaries.update",
      resourceType: "ArtistProfile",
      resourceId: profile.id,
      before: { answered: before.nudity !== null },
      after: { answered: parsed.data.nudity !== null },
    });
  }
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  return { ok: true };
}

export async function addAvailability(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = AvailabilityInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  await prisma.availability.create({
    data: {
      profileId: profile.id,
      from: new Date(d.from),
      to: new Date(d.to),
      type: d.type,
      zones: toJson(d.zones),
    },
  });
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  return { ok: true };
}

export async function deleteAvailability(id: string): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  await prisma.availability.deleteMany({
    where: { id, profileId: profile.id },
  });
  revalidatePath("/[locale]/talents/(space)/app/profil", "page");
  return { ok: true };
}
