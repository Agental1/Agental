import type { ErrorKey } from "./action-result";

/**
 * Age rules, in UTC calendar dates only.
 *
 * A birth date is a calendar date, not an instant. The form sends "yyyy-mm-dd",
 * Prisma stores it as midnight UTC, and the old helpers (one in each of
 * actions/onboarding.ts and actions/profile.ts) compared it against `new Date()`
 * with local-time setFullYear, so the answer depended on the server's time zone
 * and on the hour of the request. Everything here reads UTC year, month and day
 * and never compares instants.
 */

export const ADULT_AGE = 18;

/** Oldest birth date accepted, to catch typos like 1099 for 1999. */
const MAX_AGE = 120;

interface CalendarDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict "yyyy-mm-dd" parse. Rejects impossible dates such as 2023-02-30. */
function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

function toCalendarDate(value: string | Date): CalendarDate | null {
  if (typeof value === "string") return parseIsoDate(value);
  if (Number.isNaN(value.getTime())) return null;
  return {
    y: value.getUTCFullYear(),
    m: value.getUTCMonth() + 1,
    d: value.getUTCDate(),
  };
}

/**
 * Full years between the birth date and `today`, both read as UTC calendar
 * dates. Null when the birth date cannot be read. A 29 February birthday turns
 * over on 1 March in common years.
 */
export function ageOn(
  birthDate: string | Date,
  today: Date = new Date()
): number | null {
  const b = toCalendarDate(birthDate);
  const t = toCalendarDate(today);
  if (!b || !t) return null;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age--;
  return age;
}

/** 18 or older on `today`. False when the date is missing or unreadable. */
export function isAdult(
  birthDate: string | Date | null | undefined,
  today: Date = new Date()
): boolean {
  if (!birthDate) return false;
  const age = ageOn(birthDate, today);
  return age !== null && age >= ADULT_AGE;
}

/**
 * The `isMinor` column. Only a readable birth date can make someone a minor:
 * a missing date stays false here, and the adult checks that need a date
 * (isAdult, birthDateError) refuse it separately.
 */
export function isMinorOn(
  birthDate: string | Date | null | undefined,
  today: Date = new Date()
): boolean {
  if (!birthDate) return false;
  const age = ageOn(birthDate, today);
  return age !== null && age < ADULT_AGE;
}

/**
 * Validation for a required adult birth date, as a translation key. Used by the
 * Zod schemas so the wizard, the profile editor and the server agree.
 */
export function birthDateError(
  value: string | null | undefined,
  today: Date = new Date()
): ErrorKey | null {
  if (!value || !value.trim()) return "errors.birthDateRequired";
  const age = ageOn(value, today);
  // Any date after `today` yields a negative age, so `age < 0` is the
  // future-date check.
  if (age === null || age < 0 || age > MAX_AGE) return "errors.birthDateInvalid";
  if (age < ADULT_AGE) return "errors.adultsOnly";
  return null;
}

/** UTC calendar date of an instant, as "yyyy-mm-dd". */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
