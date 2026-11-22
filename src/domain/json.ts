import { z } from "zod";

/**
 * Typed schemas for the String-encoded JSON columns, with safe parse/serialize
 * helpers. On Postgres these could become native jsonb; the app-level contract
 * stays identical.
 */

export const PhysicalTraits = z.object({
  heightCm: z.number().int().min(40).max(260).optional(),
  hair: z.string().optional(),
  /** Round 8: one of HAIR_LENGTHS (src/domain/identity.ts). */
  hairLength: z.string().optional(),
  eyes: z.string().optional(),
  build: z.string().optional(),
  languages: z.array(z.string()).default([]),
  accents: z.array(z.string()).default([]),
});
export type PhysicalTraits = z.infer<typeof PhysicalTraits>;

/**
 * Set or clear the height while keeping every other physical trait. Signup
 * asks only for the height, and writing the step's input as the whole column
 * would erase hair, eyes and languages saved from the profile editor. The
 * field is prefilled from the stored value, so a blank one means the talent
 * cleared it.
 */
export function withHeight(
  existing: PhysicalTraits,
  heightCm: number | undefined
): PhysicalTraits {
  const { heightCm: _previous, ...rest } = existing;
  void _previous;
  return heightCm === undefined ? rest : { ...rest, heightCm };
}

export const RoleSpec = z.object({
  role: z.string().optional(),
  gender: z.string().optional(),
  ageMin: z.number().int().optional(),
  ageMax: z.number().int().optional(),
  physicalType: z.string().optional(),
  language: z.string().optional(),
  accent: z.string().optional(),
  constraints: z.array(z.string()).default([]),
});
export type RoleSpec = z.infer<typeof RoleSpec>;

/** Parse a JSON string column against a schema, falling back to the schema default. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string | null): T {
  try {
    return schema.parse(JSON.parse(raw ?? "{}"));
  } catch {
    return schema.parse(schema instanceof z.ZodArray ? [] : {});
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/** String-array columns (mobilityCountries, tags, zones…). */
export function parseStringArray(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
