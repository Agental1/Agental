/**
 * Locale-aware formatting for money, dates and percentages.
 *
 * These are the strings a translation pass cannot reach: there is no French
 * *word* to extract from `toLocaleString("fr-FR")`, so an extraction driven by
 * visible copy walks straight past them and the app keeps rendering French
 * number formats under <html lang="en">. Seven call sites did exactly that,
 * plus a commission label that replaced "." with "," unconditionally — so /en
 * showed "7,5 %".
 *
 * Every function takes the locale explicitly. Reading it from a global would
 * work in server components and quietly break in client ones.
 */

/**
 * Every amount on the site is in US dollars: plan prices, Limelight offers,
 * fees and rates. One currency, set here.
 */
export const CURRENCY = "USD";

/** Dollar amount from cents, rounded to whole dollars, e.g. 48000 → "$480". */
export function money(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

/** Dollar amount keeping cents, for figures where the decimals matter. */
export function moneyExact(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
}

/**
 * Plain integer with locale digit grouping, e.g. 1240 → "1 240" (fr) /
 * "1,240" (en). The casting demo shipped this figure as the literal string
 * "1 240" in JSX, so /en and /es rendered French thin-space grouping — the
 * exact leak this module exists to close, and one no word-list can catch.
 */
export function integer(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Date only, e.g. "22/05/2026" (fr) / "05/22/2026" (en). */
export function date(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}

/** Date and time, for audit trails and message timestamps. */
export function dateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

/**
 * Commission rate as a percentage label, e.g. 0.075 → "7,5 %" (fr) / "7.5%" (en).
 *
 * Intl places the sign and the separator per locale, which is the whole point:
 * the previous implementation hardcoded the French decimal comma.
 */
export function percent(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate);
}

/**
 * Round 11: the admin shows dates and reads its date filters in ONE zone, the
 * founders' (Los Angeles), with the zone printed, so "created before Nov 23"
 * means the same day the table shows, whatever the server's own zone is.
 */
export const ADMIN_TIME_ZONE = "America/Los_Angeles";

export function adminDateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    // dateStyle cannot be combined with timeZoneName: the same look, field by field.
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ADMIN_TIME_ZONE,
    timeZoneName: "short",
  }).format(value);
}

/** Midnight at the start of a calendar day ("2026-11-23") in a time zone, as an instant. */
export function zonedDayStart(day: string, timeZone: string = ADMIN_TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offsetAt = (t: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value])
    );
    const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return wall - t;
  };
  // Twice: the offset at the guess can differ from the offset at the answer (a DST change that day).
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}
