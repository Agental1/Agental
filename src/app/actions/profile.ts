"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { recomputeCompleteness } from "@/lib/completeness";
import { toJson } from "@/domain/json";
import {
  ProfileIdentity,
  ProfilePhysical,
  ProfileSpecialties,
  PreferencesInput,
  AvailabilityInput,
} from "@/domain/profile";

export type SaveResult = { ok: boolean; error?: string; completeness?: number };

async function requireProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
}

function isMinorFrom(birthDate?: string): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const e = new Date(d);
  e.setFullYear(e.getFullYear() + 18);
  return e > new Date();
}

async function done(profileId: string): Promise<SaveResult> {
  const completeness = await recomputeCompleteness(profileId);
  revalidatePath("/talents/app/profil");
  revalidatePath("/talents/app");
  return { ok: true, completeness };
}

export async function saveProfileIdentity(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const parsed = ProfileIdentity.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      stageName: d.stageName,
      legalName: d.legalName || null,
      phone: d.phone || null,
      city: d.city || null,
      bio: d.bio || null,
      birthDate: d.birthDate ? new Date(d.birthDate) : null,
      isMinor: isMinorFrom(d.birthDate),
    },
  });
  return done(profile.id);
}

export async function saveProfilePhysical(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const parsed = ProfilePhysical.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
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
  if (!profile) return { ok: false, error: "Non autorisé." };
  const parsed = ProfileSpecialties.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
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
  return done(profile.id);
}

export async function savePreferences(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const parsed = PreferencesInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { preferences: toJson(parsed.data) },
  });
  revalidatePath("/talents/app/profil");
  return { ok: true };
}

export async function addAvailability(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  const parsed = AvailabilityInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message };
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
  revalidatePath("/talents/app/profil");
  return { ok: true };
}

export async function deleteAvailability(id: string): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: "Non autorisé." };
  await prisma.availability.deleteMany({
    where: { id, profileId: profile.id },
  });
  revalidatePath("/talents/app/profil");
  return { ok: true };
}
