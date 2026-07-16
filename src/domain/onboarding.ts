import { z } from "zod";
import { SpecialtyKind, SpecialtyLevel } from "./enums";

/* ── Talents onboarding (5 steps) ─────────────────────────────────────────── */

export const IdentityStep = z.object({
  stageName: z.string().min(2, "Ton nom artistique est requis."),
  legalName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  birthDate: z.string().optional(), // ISO date (yyyy-mm-dd)
});
export type IdentityStep = z.infer<typeof IdentityStep>;

export const PhysicalStep = z.object({
  heightCm: z.coerce.number().int().min(40).max(260).optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  build: z.string().optional(),
  languages: z.array(z.string()).default([]),
  accents: z.array(z.string()).default([]),
});
export type PhysicalStep = z.infer<typeof PhysicalStep>;

export const SpecialtiesStep = z.object({
  specialties: z
    .array(
      z.object({
        kind: SpecialtyKind,
        level: SpecialtyLevel.default("BEGINNER"),
      })
    )
    .min(1, "Choisis au moins une spécialité."),
  mobilityCountries: z.array(z.string()).default(["FR"]),
  minRateEuros: z.coerce.number().min(0).optional(),
});
export type SpecialtiesStep = z.infer<typeof SpecialtiesStep>;

export const MandatStep = z.object({
  accept: z.literal(true, {
    message: "Tu dois accepter le mandat pour être représenté.",
  }),
});

/* ── Casting onboarding (3 steps) ─────────────────────────────────────────── */

export const CastingIdentityStep = z.object({
  organizationName: z.string().min(2, "Le nom de votre structure est requis."),
  siret: z
    .string()
    .regex(/^\d{14}$/, "Le SIRET doit comporter 14 chiffres.")
    .optional()
    .or(z.literal("")),
  contactName: z.string().optional(),
});
export type CastingIdentityStep = z.infer<typeof CastingIdentityStep>;

export const CastingScopeStep = z.object({
  projectTypes: z
    .array(z.string())
    .min(1, "Sélectionnez au moins un type de projet."),
  zones: z.array(z.string()).default([]),
});
export type CastingScopeStep = z.infer<typeof CastingScopeStep>;
