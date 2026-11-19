import { z } from "zod";

/**
 * Height: entered in feet and inches or in centimeters, always stored as whole
 * centimeters (`heightCm` in the profile's `physical` JSON).
 *
 * US talents think in feet and inches, so English defaults to imperial and the
 * other locales to metric, with a toggle either way. The accepted range is
 * 3'0" to 7'11", which is 91 to 241 cm once rounded; the stored-data schema in
 * json.ts keeps its wider 40-260 window so older rows still parse.
 */

export const HEIGHT_MIN_CM = 91; // 3'0" (91.44 cm)
export const HEIGHT_MAX_CM = 241; // 7'11" (241.3 cm)
export const HEIGHT_MIN_FEET = 3;
export const HEIGHT_MAX_FEET = 7;

const CM_PER_INCH = 2.54;

export type HeightUnit = "imperial" | "metric";

/** Feet and inches to whole centimeters. */
export function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH);
}

/** Centimeters to the nearest whole inch, split into feet and inches. */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** English speakers get feet and inches first; everyone else centimeters. */
export function defaultHeightUnit(locale: string): HeightUnit {
  return locale === "en" || locale.startsWith("en-") ? "imperial" : "metric";
}

/**
 * Display string, e.g. 170 → "5 ft 7 in" (en) / "170 cm" (fr). Units and
 * joining come from Intl, so Chinese renders "5英尺7英寸" instead of a
 * hardcoded space-separated pair.
 */
export function formatHeight(
  cm: number,
  locale: string,
  unit: HeightUnit = defaultHeightUnit(locale)
): string {
  const unitFormat = (u: "foot" | "inch" | "centimeter", n: number) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "short",
    }).format(n);
  if (unit === "metric") return unitFormat("centimeter", Math.round(cm));
  const { feet, inches } = cmToFtIn(cm);
  if (inches === 0) return unitFormat("foot", feet);
  return new Intl.ListFormat(locale, { type: "unit", style: "narrow" }).format([
    unitFormat("foot", feet),
    unitFormat("inch", inches),
  ]);
}

/** What the height field sends to a server action. */
export type HeightValue =
  | { unit: "imperial"; feet: number; inches: number }
  | { unit: "metric"; cm: number };

const RANGE = "errors.heightRange";

/**
 * Server-side input schema: a unit-tagged value, transformed to centimeters
 * and range-checked. Plain numbers, never z.coerce: coercing a blank field
 * gives 0, which would turn "not given" into an out-of-range error.
 */
export const HeightInput = z
  .discriminatedUnion("unit", [
    z.object({
      unit: z.literal("imperial"),
      feet: z.number({ error: RANGE }).int(RANGE).min(HEIGHT_MIN_FEET, RANGE).max(HEIGHT_MAX_FEET, RANGE),
      inches: z.number({ error: RANGE }).int(RANGE).min(0, RANGE).max(11, RANGE),
    }),
    z.object({
      unit: z.literal("metric"),
      cm: z.number({ error: RANGE }).int(RANGE),
    }),
  ])
  .transform((v) => (v.unit === "imperial" ? ftInToCm(v.feet, v.inches) : v.cm))
  .pipe(z.number().int().min(HEIGHT_MIN_CM, RANGE).max(HEIGHT_MAX_CM, RANGE));

/** The raw text of the height inputs, as the field holds them. */
export interface HeightFields {
  feet: string;
  inches: string;
  cm: string;
}

/**
 * Turn the field's text into a HeightValue, or undefined when nothing was
 * entered. Inches left blank next to a chosen foot count mean 0. Text that is
 * present but unreadable is passed through as NaN so the server refuses it
 * with the range message rather than silently dropping it.
 */
export function heightFromFields(
  unit: HeightUnit,
  fields: HeightFields
): HeightValue | undefined {
  if (unit === "metric") {
    const cm = fields.cm.trim();
    return cm ? { unit, cm: Number(cm) } : undefined;
  }
  const feet = fields.feet.trim();
  const inches = fields.inches.trim();
  if (!feet && !inches) return undefined;
  return {
    unit,
    feet: feet ? Number(feet) : Number.NaN,
    inches: inches ? Number(inches) : 0,
  };
}

/** Prefill the field's text from a stored height. */
export function fieldsFromCm(cm: number | undefined): HeightFields {
  if (cm == null) return { feet: "", inches: "", cm: "" };
  const { feet, inches } = cmToFtIn(cm);
  return { feet: String(feet), inches: String(inches), cm: String(cm) };
}

const BLANK_FIELDS: HeightFields = { feet: "", inches: "", cm: "" };

const textOf = (n: number) => (Number.isFinite(n) ? String(n) : "");

/** Whole centimeters for a value the server accepts, otherwise undefined. */
export function heightToCm(value: HeightValue | undefined): number | undefined {
  const parsed = HeightInput.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The field's text for a value: a stored height, or the value the field last
 * reported. A field that mounts again (a wizard step, a hidden tab) thus shows
 * what will be saved. An entry the server would refuse is shown as typed, in
 * its own unit, with the other unit blank.
 */
export function fieldsFromValue(value: HeightValue | undefined): HeightFields {
  const cm = heightToCm(value);
  if (value?.unit === "metric") {
    return cm === undefined ? { ...BLANK_FIELDS, cm: textOf(value.cm) } : fieldsFromCm(cm);
  }
  if (value?.unit === "imperial") {
    return {
      feet: textOf(value.feet),
      inches: textOf(value.inches),
      cm: cm === undefined ? "" : String(cm),
    };
  }
  return { ...BLANK_FIELDS };
}

/**
 * The unit a field opens on: imperial when the value was entered that way,
 * metric for a metric entry the server would refuse (only centimeters can show
 * it), the locale's default otherwise. Stored heights arrive as metric, so
 * they open on the default.
 */
export function initialHeightUnit(
  value: HeightValue | undefined,
  locale: string
): HeightUnit {
  if (value?.unit === "imperial") return "imperial";
  if (value?.unit === "metric" && heightToCm(value) === undefined) return "metric";
  return defaultHeightUnit(locale);
}

/**
 * The text once the unit toggle leaves `from`, and whether the field must now
 * report the height as cleared.
 *
 * A toggle changes the view and keeps the value to save, so nothing gets
 * rounded through the other unit:
 * - text left untouched since both units last agreed (`edited` false) stays
 *   as it is, the other unit included;
 * - an edited entry fills the other unit from its exact value;
 * - a blank entry blanks the other unit too, so a cleared height stays
 *   cleared. So does an entry the server would refuse, which the other unit
 *   cannot show: it is dropped, and `cleared` asks the caller to report it.
 */
export function switchHeightUnit(
  from: HeightUnit,
  fields: HeightFields,
  edited: boolean
): { fields: HeightFields; cleared: boolean } {
  const value = heightFromFields(from, fields);
  const cm = heightToCm(value);
  if (cm === undefined) {
    return { fields: { ...BLANK_FIELDS }, cleared: value !== undefined };
  }
  if (!edited) return { fields, cleared: false };
  if (from === "imperial") {
    return { fields: { ...fields, cm: String(cm) }, cleared: false };
  }
  const { feet, inches } = cmToFtIn(cm);
  return {
    fields: { ...fields, feet: String(feet), inches: String(inches) },
    cleared: false,
  };
}
