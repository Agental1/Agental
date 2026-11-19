import { z } from "zod";
import { SpecialtyKind, SpecialtyLevel } from "./enums";
import { birthDateError } from "./age";
import { HeightInput } from "./height";

/* ── Talents onboarding (3 steps: identity, profile basics, mandate) ─────── */

/**
 * Required adult birth date, "yyyy-mm-dd". One issue at most, keyed, so
 * zodError() hands the wizard the precise reason: missing, unreadable or
 * under 18. Rules live in ./age so every caller applies the same UTC math.
 */
export const BirthDateInput = z
  .string({ error: "errors.birthDateRequired" })
  .superRefine((value, ctx) => {
    const key = birthDateError(value);
    if (key) ctx.addIssue({ code: "custom", message: key });
  });

export const IdentityStep = z.object({
  stageName: z.string().trim().min(2, "errors.stageNameRequired"),
  legalName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  birthDate: BirthDateInput,
});
export type IdentityStep = z.infer<typeof IdentityStep>;

/**
 * Second signup step: what the talent does, plus an optional height. Kinds
 * only; levels are kept from any earlier save and default to BEGINNER.
 */
export const ProfileBasicsStep = z.object({
  specialties: z
    .array(SpecialtyKind)
    .min(1, "errors.specialtyRequired")
    .transform((kinds) => [...new Set(kinds)]),
  height: HeightInput.optional(),
});
export type ProfileBasicsStep = z.infer<typeof ProfileBasicsStep>;

/** Profile editor specialties tab: kinds with levels, mobility and rate. */
export const SpecialtiesStep = z.object({
  specialties: z
    .array(
      z.object({
        kind: SpecialtyKind,
        level: SpecialtyLevel.default("BEGINNER"),
      })
    )
    .min(1, "errors.specialtyRequired"),
  mobilityCountries: z.array(z.string()).default(["FR"]),
  minRateEuros: z.coerce.number().min(0).optional(),
});
export type SpecialtiesStep = z.infer<typeof SpecialtiesStep>;

export const MandatStep = z.object({
  accept: z.literal(true, {
    message: "errors.mandatRequired",
  }),
});

/* ── Casting onboarding (3 steps) ─────────────────────────────────────────── */

export const CastingIdentityStep = z.object({
  organizationName: z.string().min(2, "errors.orgNameRequired"),
  siret: z
    .string()
    .regex(/^\d{14}$/, "errors.siretFormat")
    .optional()
    .or(z.literal("")),
  contactName: z.string().optional(),
});
export type CastingIdentityStep = z.infer<typeof CastingIdentityStep>;

export const CastingScopeStep = z.object({
  projectTypes: z
    .array(z.string())
    .min(1, "errors.projectTypeRequired"),
  zones: z.array(z.string()).default([]),
});
export type CastingScopeStep = z.infer<typeof CastingScopeStep>;
