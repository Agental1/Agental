import { z } from "zod";
import { BirthDateInput, SpecialtiesStep } from "./onboarding";
import { HeightInput } from "./height";
import { ProfileLinks } from "./profile-links";
import { GENDERS } from "./identity";

/** The bio's length limit (round 8: 5,000 characters, with a live counter). */
export const BIO_MAX = 5000;

const nameField = z.string().trim().max(80).optional();
const list = z.array(z.string().trim().min(1).max(60)).max(40);

/**
 * Identity + bio, used on the profile edit screen. A patch since round 8
 * (autosave): every field is optional and a field left out keeps its stored
 * value; an empty string clears an optional field.
 */
export const ProfileIdentity = z.object({
  /** Optional since round 8 ("If you work under another name"). */
  stageName: z.string().trim().max(80).optional(),
  /** For contracts and payments; never shown to casting. */
  legalFirstName: nameField,
  legalLastName: nameField,
  /** Used only for role matching. */
  gender: z.enum(GENDERS).nullish(),
  genderOther: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(40).optional(),
  /** Round 8: E.164, checked again on the server with libphonenumber. */
  phoneE164: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "errors.phoneInvalid").optional(),
  city: z.string().trim().max(120).optional(),
  /** Round 8: a city picked from GeoNames; the server reads its name and codes. */
  cityGeonameId: z.number().int().positive().optional(),
  /** Adults only, checked as at signup. */
  birthDate: BirthDateInput.optional(),
  /** Stored with the physical details, edited in Identity since round 8. */
  languages: list.optional(),
  accents: list.optional(),
  bio: z.string().max(BIO_MAX).optional(),
  /** Absent keeps the stored link; an empty string clears it. */
  imdbUrl: ProfileLinks.shape.imdbUrl.optional(),
  portfolioUrl: ProfileLinks.shape.portfolioUrl.optional(),
});
export type ProfileIdentity = z.infer<typeof ProfileIdentity>;

/**
 * Physical tab. Height arrives unit-tagged (feet and inches, or centimeters)
 * and leaves as the stored shape, `heightCm` in whole centimeters.
 */
export const ProfilePhysical = z
  .object({
    /** Absent keeps the stored height; null clears it. */
    height: HeightInput.nullish(),
    hair: z.string().optional(),
    hairLength: z.string().optional(),
    eyes: z.string().optional(),
    build: z.string().max(60).optional(),
    weightKg: z.number().int().min(20).max(300).nullish(),
    tattoos: z.string().max(200).optional(),
    piercings: z.string().max(200).optional(),
    sizeTop: z.string().max(20).optional(),
    sizeBottom: z.string().max(20).optional(),
    sizeDressSuit: z.string().max(20).optional(),
    shoeSize: z.string().max(20).optional(),
    /** Left out since round 8 (edited in Identity): the stored lists are kept. */
    languages: z.array(z.string()).optional(),
    accents: z.array(z.string()).optional(),
  })
  .transform(({ height, ...rest }) =>
    height === undefined ? rest : { heightCm: height ?? undefined, clearHeight: height === null, ...rest }
  );
export type ProfilePhysical = z.infer<typeof ProfilePhysical>;
export const ProfileSpecialties = SpecialtiesStep;

export const AvailabilityInput = z.object({
  from: z.string(), // ISO date
  to: z.string(),
  type: z.enum(["AVAILABLE", "UNAVAILABLE"]).default("AVAILABLE"),
  zones: z.array(z.string()).default([]),
});
export type AvailabilityInput = z.infer<typeof AvailabilityInput>;

/**
 * Job preferences and content boundaries live in ./preferences.ts. Re-exported
 * so existing imports of PreferencesInput from this file keep working.
 */
export { ContentBoundariesInput, PreferencesInput } from "./preferences";
