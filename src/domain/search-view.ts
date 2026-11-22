/** The three lists at the top of Applications (round 8c), in button order. */
export const SEARCH_VIEWS = ["queue", "running", "finished"] as const;
export type SearchView = (typeof SEARCH_VIEWS)[number];

/** Old dashboard links used anchors; both spellings land on the same button. */
const ALIASES: Record<string, SearchView> = {
  queue: "queue",
  queued: "queue",
  "search-queue": "queue",
  running: "running",
  "search-running": "running",
  finished: "finished",
  "search-finished": "finished",
};

/**
 * The button to open: the one asked for (?view=), else the list with
 * something happening (running first, then roles found, then the queue).
 */
export function pickSearchView(
  asked: string | string[] | undefined,
  counts: Record<SearchView, number>
): SearchView {
  const raw = Array.isArray(asked) ? asked[0] : asked;
  const known = raw ? ALIASES[raw] : undefined;
  if (known) return known;
  if (counts.running > 0) return "running";
  if (counts.finished > 0) return "finished";
  if (counts.queue > 0) return "queue";
  return "finished";
}
