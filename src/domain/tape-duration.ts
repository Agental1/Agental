/**
 * Length of a self-tape against the length a casting request asks for.
 * Pure: the browser reads the duration, the request text gives the limit.
 * It says nothing about the acting, only about the clock.
 */

/** Longest limit we trust from free text (an hour). Anything bigger is a misparse. */
const MAX_LIMIT_SECONDS = 3600;

/**
 * Reads an expected length out of a free-text requirement such as
 * "Monologue, under 3 minutes", "max 90 seconds", "2 min" or "1:30".
 * Returns whole seconds, or null when the text gives no length.
 */
export function parseMaxDurationSeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const clock = text.match(/(?<![\d:.,])(\d{1,2}):([0-5]\d)(?![\d:])/);
  if (clock) return limit(Number(clock[1]) * 60 + Number(clock[2]));

  const num = "(\\d+(?:[.,]\\d+)?)";
  const min = text.match(new RegExp(`${num}\\s*(?:minutes?|mins?|min)\\b`, "i"));
  const sec = text.match(new RegExp(`${num}\\s*(?:seconds?|secs?|sec)\\b`, "i"));
  if (!min && !sec) return null;
  const value = (m: RegExpMatchArray | null) => (m ? Number(m[1].replace(",", ".")) : 0);
  return limit(Math.round(value(min) * 60 + value(sec)));
}

function limit(seconds: number): number | null {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_LIMIT_SECONDS ? seconds : null;
}

/** 168 -> "2:48", 3725 -> "62:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** How the limit is named in a sentence: whole minutes, short seconds, else a clock. */
export type LimitLabel =
  | { unit: "minutes"; value: number }
  | { unit: "seconds"; value: number }
  | { unit: "clock"; clock: string };

export function limitLabel(limitSeconds: number): LimitLabel {
  if (limitSeconds % 60 === 0) return { unit: "minutes", value: limitSeconds / 60 };
  if (limitSeconds < 120) return { unit: "seconds", value: limitSeconds };
  return { unit: "clock", clock: formatClock(limitSeconds) };
}

export type TapeDuration =
  | { status: "unknown" }
  | { status: "plain"; clock: string }
  | { status: "within"; clock: string; limit: LimitLabel }
  | { status: "over"; clock: string; limit: LimitLabel; overMinutes: number; overSeconds: number };

/**
 * `durationSeconds` is the video length; `maxSeconds` the limit, or null/undefined
 * when the request gives none. A missing, zero, negative or non-finite duration
 * is "unknown" (show nothing). Exactly at the limit counts as within.
 */
export function describeTapeDuration(
  durationSeconds: number | null | undefined,
  maxSeconds?: number | null,
): TapeDuration {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { status: "unknown" };
  }
  const seconds = Math.round(durationSeconds);
  if (seconds <= 0) return { status: "unknown" };
  const clock = formatClock(seconds);
  if (maxSeconds == null || !Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    return { status: "plain", clock };
  }
  const lim = limitLabel(Math.round(maxSeconds));
  if (seconds <= maxSeconds) return { status: "within", clock, limit: lim };
  const over = seconds - Math.round(maxSeconds);
  return { status: "over", clock, limit: lim, overMinutes: Math.floor(over / 60), overSeconds: over % 60 };
}
