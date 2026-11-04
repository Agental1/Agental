import { z } from "zod";
import appMessages from "../../messages/en/app.json";

/**
 * Why a talent was matched, as keys rather than a sentence.
 *
 * The explanation is computed once, on the server, and read afterwards by
 * several people in different languages: the casting director who ran the
 * brief, a colleague in the same organisation, and — through
 * candidatures-list.tsx — the talent themselves. A generated sentence freezes
 * the language at the moment of scoring, and it did: every shortlist showed
 * French to every reader, and the rows persisted that way.
 *
 * Keys are derived from the French message file, like ErrorKey and TipKey: a
 * key that does not exist fails `bun run typecheck` rather than surfacing as a
 * raw path in a shortlist.
 */
export type ReasonKey = keyof (typeof appMessages)["matchReasons"];

const REASON_KEYS = Object.keys(appMessages.matchReasons) as [
  ReasonKey,
  ...ReasonKey[],
];

/**
 * `values` carries ICU arguments — "Accent {accent} natif" needs the accent
 * name, and that name is data, not a translatable string.
 */
export const MatchReason = z.object({
  key: z.enum(REASON_KEYS),
  values: z.record(z.string(), z.string()).optional(),
});
export type MatchReason = z.infer<typeof MatchReason>;

export const MatchReasons = z.array(MatchReason).default([]);

/** Build a reason. Keeps the scorer's call sites to one short expression. */
export function reason(
  key: ReasonKey,
  values?: Record<string, string>
): MatchReason {
  return values ? { key, values } : { key };
}
