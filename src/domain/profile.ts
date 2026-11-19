import { z } from "zod";
import { IdentityStep, SpecialtiesStep } from "./onboarding";
import { HeightInput } from "./height";

/** Identity + bio, used on the profile edit screen. */
export const ProfileIdentity = IdentityStep.extend({
  bio: z.string().max(600).optional(),
});
export type ProfileIdentity = z.infer<typeof ProfileIdentity>;

/**
 * Physical tab. Height arrives unit-tagged (feet and inches, or centimeters)
 * and leaves as the stored shape, `heightCm` in whole centimeters.
 */
export const ProfilePhysical = z
  .object({
    height: HeightInput.optional(),
    hair: z.string().optional(),
    eyes: z.string().optional(),
    build: z.string().optional(),
    languages: z.array(z.string()).default([]),
    accents: z.array(z.string()).default([]),
  })
  .transform(({ height, ...rest }) =>
    height === undefined ? rest : { heightCm: height, ...rest }
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

/** Auto-candidature & career preferences. */
export const PreferencesInput = z.object({
  autoApply: z.boolean().default(false),
  projectTypes: z.array(z.string()).default([]),
  dailyCap: z.coerce.number().int().min(0).max(100).optional(),
  minRateEuros: z.coerce.number().min(0).optional(),
  nudity: z.boolean().default(false),
  animals: z.boolean().default(false),
});
export type PreferencesInput = z.infer<typeof PreferencesInput>;
