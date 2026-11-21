/**
 * CSV output for exports that people open in a spreadsheet.
 *
 * RFC 4180: fields separated by commas, records by CRLF, a field holding a
 * comma, a quote or a line break wrapped in double quotes with inner quotes
 * doubled.
 *
 * On top of that, formula neutralizing. A spreadsheet runs a cell that
 * starts with "=", "+", "-" or "@" as a formula, and a lead's name is typed
 * by a stranger: `=HYPERLINK(...)` in a name must arrive as text. Such a
 * cell, and one that starts with a tab or a carriage return, gets a leading
 * apostrophe, which spreadsheets read as "this is text".
 */

const FORMULA_START = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** One cell, neutralized and quoted as needed. Null and undefined are empty. */
export function csvCell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Only text can be typed by a stranger. A number or a date is ours, and
  // "-5" must stay a number.
  if (typeof value === "string" && text.length > 0 && FORMULA_START.has(text[0])) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text. Every record ends with CRLF, the last one included. */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | Date | null | undefined>>
): string {
  return rows.map((row) => `${row.map(csvCell).join(",")}\r\n`).join("");
}
