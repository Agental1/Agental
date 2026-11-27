/**
 * Round 12 g5: pure helpers for the searches dashboard (lanes, allowance meter,
 * match score). Presentation only: no search, quota or queue rule lives here.
 */
export const LANES = ["queued", "running", "done"] as const;
export type Lane = (typeof LANES)[number];

export interface BoardSearch {
  id: string;
  status: string;
  createdAt: string;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** The lane a search status belongs to; failed and canceled searches have none. */
export function laneOf(status: string): Lane | null {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "done") return "done";
  return null;
}

const time = (s: string | null) => (s ? new Date(s).getTime() : 0);

/**
 * Searches grouped in the three lanes. Queued: next to start first. Running:
 * oldest first. Done: most recent first, at most `doneLimit` of them.
 */
export function groupByLane(searches: readonly BoardSearch[], doneLimit = 6): Record<Lane, BoardSearch[]> {
  const out: Record<Lane, BoardSearch[]> = { queued: [], running: [], done: [] };
  for (const s of searches) {
    const lane = laneOf(s.status);
    if (lane) out[lane].push(s);
  }
  out.queued.sort((a, b) => time(a.scheduledFor ?? a.createdAt) - time(b.scheduledFor ?? b.createdAt));
  out.running.sort((a, b) => time(a.startedAt ?? a.createdAt) - time(b.startedAt ?? b.createdAt));
  out.done.sort((a, b) => time(b.completedAt ?? b.createdAt) - time(a.completedAt ?? a.createdAt));
  out.done = out.done.slice(0, Math.max(0, doneLimit));
  return out;
}

/** The board refreshes by itself only while something is queued or running. */
export function needsPolling(lanes: Record<Lane, readonly unknown[]>): boolean {
  return lanes.queued.length > 0 || lanes.running.length > 0;
}

/** Allowance meter: used out of total, as a whole percent from 0 to 100. */
export function meterPercent(used: number, total: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

/** A match score as a whole percent from 0 to 100; null when there is none. */
export function clampScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}
