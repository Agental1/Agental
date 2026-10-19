import { z } from "zod";
import appMessages from "../../messages/en/app.json";

/**
 * Valid error keys, derived from the French message file rather than typed as
 * `string`. A key that does not exist now fails `bun run typecheck` instead of
 * reaching a user as a raw path like "errors.someTypo".
 */
export type ErrorKey = `errors.${keyof (typeof appMessages)["errors"]}`;

/**
 * The error shape every server action returns.
 *
 * Actions run on the server; their output is rendered on the client. A ready
 * translated sentence therefore freezes the language at the moment the action
 * ran, which is wrong for a trilingual app — and it was: every action returned
 * a French literal, so an English or Spanish user hit French the first time
 * anything failed.
 *
 * `key` is a path inside the `app.errors` namespace. `values` carries ICU
 * arguments for the messages that interpolate — a bare key cannot express
 * "your {plan} plan allows {limit} projects".
 */
export interface ActionError {
  key: ErrorKey;
  values?: Record<string, string | number>;
}

/** Build an ActionError. Keeps call sites to one short expression. */
export function err(
  key: ErrorKey,
  values?: Record<string, string | number>
): ActionError {
  return values ? { key, values } : { key };
}

/**
 * Turn a Zod failure into an ActionError.
 *
 * Schemas carry key paths as their messages (see src/domain/onboarding.ts), so
 * the first issue's message is already a key. Rules with no custom message fall
 * through to the global map below, which yields `errors.invalidInput`.
 */
const KNOWN_ERROR_KEYS: ReadonlySet<string> = new Set(
  Object.keys(appMessages.errors).map((k) => `errors.${k}`)
);

export function zodError(error: z.ZodError): ActionError {
  const first = error.issues[0]?.message;
  // Membership check, not just a `startsWith` prefix test. Schema messages are
  // plain strings, so the compiler cannot vet them: a typo like
  // "errors.stagNameRequired" would pass a prefix test, get cast to ErrorKey,
  // and then miss at translation time — degrading to the last path segment in
  // front of a user. Checking the real key set turns that into the intended
  // generic message instead.
  return err(
    first && KNOWN_ERROR_KEYS.has(first)
      ? (first as ErrorKey)
      : "errors.invalidInput"
  );
}

// A global z.config({ customError }) used to live here. It was removed on
// review: redundant, because zodError() already maps any non-key message to
// errors.invalidInput, and harmful, because it replaced Zod's diagnostic text
// for EVERY schema in the app — including domain/json.ts, which parses
// DB-stored JSON — with a string that says nothing to whoever reads the log.
// It also only applied once this module happened to be imported, so the
// messages depended on the module graph.
