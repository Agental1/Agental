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

/** Euro amount from cents, e.g. 48000 → "480 €" (fr) / "€480" (en). */
export function euros(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));
}

/** Euro amount keeping cents, for figures where the decimals matter. */
export function eurosExact(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
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
