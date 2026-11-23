"use server";

import { err, zodError, type ActionError } from "@/domain/action-result";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { recomputeCompletenessDetailed } from "@/lib/completeness";
import { parseJson, PhysicalTraits, toJson } from "@/domain/json";
import { isMinorOn } from "@/domain/age";
import { audit } from "@/lib/audit";
import {
  ProfileIdentity,
  ProfilePhysical,
  ProfileSpecialties,
  AvailabilityInput,
} from "@/domain/profile";
import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { SpecialtyKind } from "@/domain/enums";
import {
  isSkillSpecialty,
  ContentBoundariesInput,
  PreferencesInput,
  mergeContentBoundaries,
  mergePreferences,
  readContentBoundaries,
} from "@/domain/preferences";

export type SaveResult = {
  ok: boolean;
  error?: ActionError;
  completeness?: number;
  /** The first time the profile reaches 100% (round 8 celebration). */
  justCompleted?: boolean;
};

async function requireProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  return prisma.artistProfile.findUnique({ where: { userId: session.user.id } });
}

async function done(profileId: string): Promise<SaveResult> {
  const { completeness, justCompleted } = await recomputeCompletenessDetailed(profileId);
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true, completeness, justCompleted };
}

export async function saveProfileIdentity(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = ProfileIdentity.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const opt = (v: string | undefined) => (v === undefined ? undefined : v || null);
  // Round 8: only a valid number is stored in E.164.
  if (d.phoneE164 !== undefined && !isValidPhoneNumber(d.phoneE164))
    return { ok: false, error: err("errors.phoneInvalid") };
  // Round 8: a picked city. Its name and codes come from our GeoNames table.
  const place =
    d.cityGeonameId === undefined
      ? null
      : await prisma.geoCity.findUnique({ where: { geonameId: d.cityGeonameId } });
  if (d.cityGeonameId !== undefined && !place) return { ok: false, error: err("errors.cityUnknown") };
  const birthDate = d.birthDate === undefined ? undefined : new Date(d.birthDate);
  // Languages and accents are edited in Identity since round 8 but stored with
  // the physical details: merged in, every other trait kept.
  const physical =
    d.languages === undefined && d.accents === undefined
      ? undefined
      : toJson({
          ...parseJson(PhysicalTraits, profile.physical),
          ...(d.languages === undefined ? {} : { languages: [...new Set(d.languages)] }),
          ...(d.accents === undefined ? {} : { accents: [...new Set(d.accents)] }),
        });
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      stageName: d.stageName,
      legalFirstName: opt(d.legalFirstName),
      legalLastName: opt(d.legalLastName),
      gender: d.gender,
      // The "Other" text only means something with "other".
      genderOther:
        d.gender === undefined
          ? opt(d.genderOther)
          : d.gender === "other"
            ? (d.genderOther ?? profile.genderOther) || null
            : null,
      physical,
      phone: opt(d.phone),
      phoneE164: d.phoneE164,
      // Round 9: text consent belongs to a number. A new number needs a new consent:
      // alerts go back to email and the consent and any STOP are cleared.
      ...(d.phoneE164 !== undefined && d.phoneE164 !== profile.phoneE164
        ? { smsConsentAt: null, smsConsentVersion: null, smsOptOutAt: null, roleAlertChannel: profile.roleAlertChannel && profile.roleAlertChannel !== "email" ? "email" : profile.roleAlertChannel }
        : {}),
      city: place ? place.name : opt(d.city),
      cityGeonameId: place ? place.geonameId : undefined,
      countryCode: place ? place.countryCode : undefined,
      admin1Code: place ? place.admin1Code || null : undefined,
      bio: opt(d.bio),
      imdbUrl: d.imdbUrl,
      portfolioUrl: d.portfolioUrl,
      birthDate,
      isMinor: d.birthDate === undefined ? undefined : isMinorOn(d.birthDate),
    },
  });
  // The mandate was signed against the stored birth date, so any change to it
  // is traced.
  if (birthDate && profile.birthDate?.getTime() !== birthDate.getTime()) {
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
  // A patch over what is stored: fields left out (languages and accents,
  // edited in Identity) keep their values; `height: null` clears the height.
  const { clearHeight, ...fields } = parsed.data as typeof parsed.data & { clearHeight?: boolean };
  const next: Record<string, unknown> = { ...parseJson(PhysicalTraits, profile.physical) };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) next[k] = v;
  if (clearHeight) delete next.heightCm;
  if (next.weightKg === null) delete next.weightKg;
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { physical: toJson(next) },
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
  // Work types, the age range and paid or unpaid count toward 100% (round 8).
  return done(profile.id);
}

const SkillsInput = z.object({
  skills: z.array(SpecialtyKind).max(SpecialtyKind.options.length),
});

/**
 * Round 8: "Skills" under Preferences, the specialties that are not work
 * types. Only skill rows change: rows of the work-type kinds (merged into the
 * work types above) and their levels stay as stored.
 */
export async function saveSkills(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = SkillsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const wanted = new Set<string>(parsed.data.skills.filter(isSkillSpecialty));
  const rows = await prisma.specialty.findMany({ where: { profileId: profile.id }, select: { id: true, kind: true } });
  const have = new Set(rows.map((r) => r.kind));
  const drop = rows.filter((r) => isSkillSpecialty(r.kind) && !wanted.has(r.kind)).map((r) => r.id);
  const add = [...wanted].filter((k) => !have.has(k));
  await prisma.$transaction([
    prisma.specialty.deleteMany({ where: { profileId: profile.id, id: { in: drop } } }),
    prisma.specialty.createMany({ data: add.map((kind) => ({ profileId: profile.id, kind, level: "BEGINNER" })) }),
  ]);
  return done(profile.id);
}

const DayRateInput = z.object({
  /** Whole US dollars a day; null clears it. */
  usd: z.number().int().min(1).max(100000).nullable(),
});

/** Round 8: the minimum day rate, asked when the performer picks paid work only. */
export async function saveDayRate(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = DayRateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { minRateCents: parsed.data.usd === null ? null : parsed.data.usd * 100 },
  });
  return done(profile.id);
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

/** Round 8: hide the dashboard's "Improve your website" line for good. */
export async function dismissWebsiteCard(): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: { websiteCardDismissedAt: new Date() },
  });
  revalidatePath("/[locale]/talents/(space)/app", "page");
  return { ok: true };
}

/** The text of the SMS consent the performer ticks, by version (round 8). */
const SMS_CONSENT_VERSION = "sms-roles-2026-11-22";

const RoleAlertInput = z.object({
  channel: z.enum(["email", "sms", "both"]),
  /** The unticked-by-default consent box, required for sms and both. */
  smsConsent: z.boolean().default(false),
});

/**
 * Round 8: "When we find a role for you, tell me by" email, text or both.
 * A text needs a valid phone number (E.164) and the explicit consent, stored
 * with its version and date. Nothing is sent in round 8.
 */
export async function saveRoleAlert(input: unknown): Promise<SaveResult> {
  const profile = await requireProfile();
  if (!profile) return { ok: false, error: err("errors.unauthorized") };
  const parsed = RoleAlertInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const { channel, smsConsent } = parsed.data;
  const wantsSms = channel !== "email";
  if (wantsSms && !profile.phoneE164) return { ok: false, error: err("errors.smsNeedsPhone") };
  if (wantsSms && !smsConsent) return { ok: false, error: err("errors.smsNeedsConsent") };
  await prisma.artistProfile.update({
    where: { id: profile.id },
    data: {
      roleAlertChannel: channel,
      // A new consent is dated; email-only keeps the record of an earlier one.
      ...(wantsSms && !profile.smsConsentAt ? { smsConsentAt: new Date(), smsConsentVersion: SMS_CONSENT_VERSION } : {}),
    },
  });
  if (wantsSms && !profile.smsConsentAt && profile.phoneE164) {
    // Round 9: the opt-in confirmation text (CTIA), only when texts are on (SMS_ENABLED).
    const { SMS_TEXT, sendSms, smsConfig } = await import("@/lib/sms");
    if (smsConfig()) await sendSms(profile.phoneE164, SMS_TEXT.start, { userId: profile.userId, kind: "opt_in" }).catch(() => {});
  }
  if (wantsSms && !profile.smsConsentAt) {
    await audit({
      actorUserId: profile.userId,
      action: "profile.smsConsent.given",
      resourceType: "ArtistProfile",
      resourceId: profile.id,
      after: { version: SMS_CONSENT_VERSION },
    });
  }
  revalidatePath("/[locale]/talents/(space)/app/parametres", "page");
  return { ok: true };
}
