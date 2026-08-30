import { z } from "zod";
import type appMessages from "../../messages/fr/app.json";

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
export function zodError(error: z.ZodError): ActionError {
  const first = error.issues[0]?.message;
  return err(
    first && first.startsWith("errors.")
      ? (first as ErrorKey)
      : "errors.invalidInput"
  );
}

/**
 * Global fallback for built-in Zod messages.
 *
 * Without this, a rule like `.int().min(40).max(260)` produces Zod's own
 * English string ("Too small: expected number to be >=40"), which has no key
 * and would be shown verbatim to a French or Spanish user. Key-ifying only the
 * custom messages would have left that hole open by construction.
 */
z.config({ customError: () => "errors.invalidInput" });
