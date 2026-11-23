/**
 * Weight: entered in pounds or kilograms, always stored as whole kilograms
 * (`weightKg` in the profile's `physical` JSON, 20 to 300).
 */

export const LB_PER_KG = 2.20462;
export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 300;

export type WeightUnit = "lb" | "kg";

export const kgToLb = (kg: number): number => Math.round(kg * LB_PER_KG);
export const lbToKg = (lb: number): number => Math.round(lb / LB_PER_KG);

/** The field's text read as whole kilograms, or undefined when unreadable or out of range. */
export function weightTextToKg(text: string, unit: WeightUnit): number | undefined {
  const n = Number(text.trim().replace(",", "."));
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  const kg = unit === "lb" ? Math.round(n / LB_PER_KG) : Math.round(n);
  return kg >= WEIGHT_MIN_KG && kg <= WEIGHT_MAX_KG ? kg : undefined;
}

/** "160 lb" and "73 kg" for 73 kg with pounds chosen. */
export function weightInBothUnits(kg: number, primary: WeightUnit): { main: string; other: string } {
  const lb = `${kgToLb(kg)} lb`;
  const metric = `${kg} kg`;
  return primary === "lb" ? { main: lb, other: metric } : { main: metric, other: lb };
}
