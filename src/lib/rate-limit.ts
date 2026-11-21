import type { PrismaClient } from "@/generated/prisma/client";

/**
 * A small rate limiter backed by the database.
 *
 * Serverless instances share no memory: a counter kept in a module variable
 * resets on every cold start and is invisible to the instance next door. Each
 * counted attempt is one RateLimitEvent row instead, and the limit is a
 * sliding window over those rows: at most `limit` events per `key` in any span
 * of `windowMs`.
 *
 * The check and the insert are two statements, not one atomic step. Two
 * requests arriving together can both read a count just under the limit and
 * both insert, so the limit can be overshot by one (and by one more for each
 * further request landing in the same instant). That is acceptable here: the
 * limiter bounds guessing, it does not meter anything billed, and closing the
 * gap would take a lock per key.
 *
 * Timestamps come from the application clock on both the write and the read,
 * so the window never depends on the database clock.
 *
 * The database client is a parameter so the limiter is tested against a mock.
 */

export type RateLimitDb = Pick<PrismaClient, "rateLimitEvent">;

export interface RateLimitOptions {
  /** Events allowed per key in one window. A positive integer. */
  limit: number;
  /** Length of the sliding window, in milliseconds. */
  windowMs: number;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts still available in the window once this call is counted. */
  remaining: number;
  /** Zero when allowed. Otherwise the wait until one attempt is free again. */
  retryAfterMs: number;
}

/**
 * Count one attempt for `key`, unless the window is already full.
 *
 * A refused call inserts nothing, so hammering a closed door does not push
 * the reopening time back. Every call also deletes this key's events that
 * have left the window. That part is best effort: a failure is logged and
 * never changes the answer.
 */
export async function hitRateLimit(
  db: RateLimitDb,
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowMs } = opts;
  if (!Number.isInteger(limit) || limit < 1 || !(windowMs > 0)) {
    throw new Error(
      "hitRateLimit needs a positive integer limit and a positive windowMs."
    );
  }
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // The newest `limit` events still inside the window. No more are needed:
  // the decision only asks whether there are that many, and the oldest of
  // them is the one whose exit from the window frees the next attempt.
  const counted = await db.rateLimitEvent.findMany({
    where: { key, createdAt: { gt: windowStart } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { createdAt: true },
  });

  let result: RateLimitResult;
  if (counted.length >= limit) {
    const oldest = counted[counted.length - 1].createdAt;
    result = {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest.getTime() + windowMs - now.getTime()),
    };
  } else {
    await db.rateLimitEvent.create({ data: { key, createdAt: now } });
    result = {
      allowed: true,
      remaining: limit - counted.length - 1,
      retryAfterMs: 0,
    };
  }

  try {
    await db.rateLimitEvent.deleteMany({
      where: { key, createdAt: { lte: windowStart } },
    });
  } catch (error) {
    console.error("[rate-limit] could not prune old events", error);
  }

  return result;
}
