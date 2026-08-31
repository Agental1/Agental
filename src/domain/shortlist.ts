/**
 * Shortlist reconciliation: deciding what a re-run of the matching may replace.
 *
 * Extracted from actions/brief.ts so the rule is testable on its own. The bug
 * this guards against was a `deleteMany` over the whole project, which wiped a
 * casting director's decisions every time a brief was re-run — the kind of
 * thing a type checker cannot see and a browser guard cannot reach.
 */

/**
 * Statuses the matcher itself assigns. A re-run owns these and may drop them.
 * Every other status means a human acted on the candidature, and survives.
 */
export const MACHINE_OWNED_STATUSES = ["NEW", "SHORTLISTED"] as const;

export interface ReconcilableCandidature {
  id: string;
  artistProfileId: string | null;
  externalTalentId: string | null;
  status: string;
}

/** The talent a candidature points at, whichever side it came from. */
export function talentIdOf(c: {
  artistProfileId: string | null;
  externalTalentId: string | null;
}): string | null {
  return c.artistProfileId ?? c.externalTalentId;
}

export interface Reconciliation<T> {
  /** Rows safe to delete: machine-owned AND no longer selected. */
  stale: T[];
  /** Rows to update in place, keyed by talent id — their status is preserved. */
  keep: Map<string, T>;
}

/**
 * Split existing candidatures against a fresh set of selected talent ids.
 *
 * A row is stale only when BOTH hold: the new run no longer selects that
 * talent, AND its status is one the matcher set. A row a director moved to
 * INVITED or CONTRACTED is never stale, even when the new scoring drops that
 * talent entirely — losing that decision is precisely the failure being fixed.
 */
export function reconcileShortlist<T extends ReconcilableCandidature>(
  existing: readonly T[],
  selectedTalentIds: Iterable<string>
): Reconciliation<T> {
  const selected = new Set(selectedTalentIds);
  const stale: T[] = [];
  const keep = new Map<string, T>();

  for (const row of existing) {
    const talentId = talentIdOf(row);
    if (talentId === null) continue; // orphaned by a SetNull cascade
    keep.set(talentId, row);
    if (
      !selected.has(talentId) &&
      (MACHINE_OWNED_STATUSES as readonly string[]).includes(row.status)
    ) {
      stale.push(row);
    }
  }

  return { stale, keep };
}
