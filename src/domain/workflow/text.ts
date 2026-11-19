/**
 * Cleaning of untrusted text.
 *
 * Text inside a brief comes from outside and is only ever data. Cleaning
 * keeps it printable and bounded: control characters go, and so do the
 * invisible format characters (zero-width, bidirectional overrides) that can
 * hide or reorder what a reader sees. The text itself is never interpreted.
 */

// C0 and C1 control characters, DEL included.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// The same, keeping line feed for multi-line text.
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;
// Zero-width characters, bidirectional marks, embeddings, overrides and
// isolates, line and paragraph separators, the byte order mark.
const INVISIBLE = /[\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** One line: no control characters, runs of whitespace folded to one space. */
export function cleanLine(value: string): string {
  return value
    .normalize("NFC")
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Several lines: line feeds kept, at most one blank line in a row. */
export function cleanBlock(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_EXCEPT_NEWLINE, " ")
    .replace(INVISIBLE, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cut to `max` characters without splitting a surrogate pair. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join("");
}

/**
 * Comparison form of a label: accents removed, lower case, punctuation and
 * spacing folded to single spaces. "The  Night-Shift!" and "the night shift"
 * compare equal. Used for the dedupe key and for matching short labels.
 */
export function foldLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
