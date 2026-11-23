import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Round 10: the phone field's editing rules, kept pure so each case is tested.
 *
 * - The text is rebuilt from the digits on every change, and the caret is put
 *   back after the same number of digits, so it never jumps.
 * - Deleting a formatting character (a parenthesis, a space, a dash) deletes the
 *   digit before it, so Backspace always removes one character the person sees
 *   as part of the number.
 * - A pasted or typed international number ("+1 213 555 0123", "+33 6 12...")
 *   picks its country.
 * - The saved value is E.164, only when the number is valid.
 */

const MAX_DIGITS = 17;
const COUNTRY_CODES = getCountries();

export interface PhoneEditResult {
  text: string;
  caret: number;
  country: CountryCode;
  /** Set only when the number is valid for the country. */
  e164: string | null;
  /** The number as shown to staff and stored as the display value. */
  display: string | null;
  empty: boolean;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Position in `text` just after its `n`-th digit (0: before the first). */
function caretAfterDigits(text: string, n: number): number {
  if (n <= 0) {
    const first = text.search(/\d/);
    return first === -1 ? text.length : first;
  }
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return text.length;
}

/** The country for a calling code: the current one when it shares it, else the main one. */
function countryForCallingCode(code: string, current: CountryCode): CountryCode | null {
  if (getCountryCallingCode(current) === code) return current;
  const main = parsePhoneNumberFromString(`+${code}`)?.country;
  if (main) return main;
  return COUNTRY_CODES.find((c) => getCountryCallingCode(c) === code) ?? null;
}

/** Format national digits for a country, as typed. */
export function formatNational(digits: string, country: CountryCode): string {
  if (!digits) return "";
  return new AsYouType(country).input(digits);
}

function result(digits: string, country: CountryCode, digitsBeforeCaret: number): PhoneEditResult {
  let text = formatNational(digits, country);
  const parsed = digits ? parsePhoneNumberFromString(digits, country) : undefined;
  const valid = !!parsed?.isValid();
  let caret = caretAfterDigits(text, Math.min(digitsBeforeCaret, digits.length));
  // A complete number typed without its trunk prefix (France: 6 12 34 56 78)
  // is left unformatted by AsYouType: show the national format, caret at the end.
  if (valid && /^\d+$/.test(text) && digitsBeforeCaret >= digits.length) {
    text = parsed!.formatNational();
    caret = text.length;
  }
  return {
    text,
    caret,
    country,
    e164: valid ? parsed!.number : null,
    display: valid ? parsed!.formatInternational() : null,
    empty: digits.length === 0,
  };
}

/**
 * One change in the field. `prev` is what was shown, `next` what the input now
 * holds, `caret` the cursor position in `next`.
 */
export function editPhone({
  prev,
  next,
  caret,
  country,
  forward = false,
}: {
  prev: string;
  next: string;
  caret: number;
  country: CountryCode;
  /** The Delete key (inputType "deleteContentForward"), not Backspace. */
  forward?: boolean;
}): PhoneEditResult {
  let text = next;
  let at = Math.max(0, Math.min(caret, text.length));

  // A "+" typed or pasted after other digits starts a new international number.
  const plus = text.lastIndexOf("+");
  if (plus > 0) text = text.slice(plus);

  // An international number: "+<code> ..." or "00<code> ...".
  const intl = text.trim().match(/^(\+|00)\s*(.*)$/);
  if (intl) {
    const all = digitsOf(intl[2]);
    const typer = new AsYouType();
    typer.input(`+${all}`);
    const code = typer.getCallingCode();
    const cc = (code && (typer.getCountry() ?? countryForCallingCode(code, country))) || null;
    if (!code || !cc) {
      // Still typing the code: keep what was typed, nothing to save yet.
      return { text: `+${all}`, caret: all.length + 1, country, e164: null, display: null, empty: false };
    }
    const national = all.slice(code.length).slice(0, MAX_DIGITS);
    return result(national, cc, national.length);
  }

  // Backspace or Delete over a formatting character only: remove a digit too.
  if (text.length < prev.length && digitsOf(text) === digitsOf(prev)) {
    if (forward) {
      // Delete: the digit after the caret goes.
      let i = at;
      while (i < text.length && !/\d/.test(text[i])) i++;
      if (i < text.length) text = text.slice(0, i) + text.slice(i + 1);
    } else {
      // Backspace: the digit before the caret goes.
      let i = at - 1;
      while (i >= 0 && !/\d/.test(text[i])) i--;
      if (i >= 0) {
        text = text.slice(0, i) + text.slice(i + 1);
        at = i;
      }
    }
  }

  const digits = digitsOf(text).slice(0, MAX_DIGITS);
  const before = digitsOf(text.slice(0, at)).length;
  return result(digits, country, before);
}

/** The same digits, reformatted for another country (the selector). */
export function changeCountry(text: string, country: CountryCode): PhoneEditResult {
  const digits = digitsOf(text).slice(0, MAX_DIGITS);
  return result(digits, country, digits.length);
}
