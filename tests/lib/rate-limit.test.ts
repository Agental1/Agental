import { describe, expect, it, vi } from "vitest";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * The limiter against an in-memory stand-in for the RateLimitEvent table. The
 * stand-in understands only the filters the limiter sends (key, createdAt gt
 * and lte, newest first, take), which is enough to exercise the decision: how
 * many attempts pass, when the door reopens, and what gets pruned.
 */

type Row = { key: string; createdAt: Date };
type Where = { key: string; createdAt: { gt?: Date; lte?: Date } };

function matches(row: Row, where: Where): boolean {
  if (row.key !== where.key) return false;
  const { gt, lte } = where.createdAt;
  if (gt && !(row.createdAt.getTime() > gt.getTime())) return false;
  if (lte && !(row.createdAt.getTime() <= lte.getTime())) return false;
  return true;
}

function fakeDb(initial: Row[] = []) {
  const rows: Row[] = [...initial];
  const rateLimitEvent = {
    findMany: vi.fn(async (args: { where: Where; take: number }) =>
      rows
        .filter((row) => matches(row, args.where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, args.take)
        .map((row) => ({ createdAt: row.createdAt }))
    ),
    create: vi.fn(async (args: { data: Row }) => {
      rows.push({ ...args.data });
      return args.data;
    }),
    deleteMany: vi.fn(async (args: { where: Where }) => {
      const kept = rows.filter((row) => !matches(row, args.where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { count };
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { rateLimitEvent } as any, rows, rateLimitEvent };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const start = new Date("2026-11-19T10:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);
const opts = (now: Date) => ({ limit: 3, windowMs: HOUR, now });

describe("hitRateLimit", () => {
  it("allows up to the limit and counts down what is left", async () => {
    const { db, rows } = fakeDb();
    expect(await hitRateLimit(db, "k", opts(at(0)))).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
    expect(await hitRateLimit(db, "k", opts(at(MINUTE)))).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(await hitRateLimit(db, "k", opts(at(2 * MINUTE)))).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0,
    });
    // One row per counted attempt, stamped with the caller's clock.
    expect(rows).toEqual([
      { key: "k", createdAt: at(0) },
      { key: "k", createdAt: at(MINUTE) },
      { key: "k", createdAt: at(2 * MINUTE) },
    ]);
  });

  it("refuses past the limit and inserts nothing", async () => {
    const { db, rows, rateLimitEvent } = fakeDb();
    for (const ms of [0, MINUTE, 2 * MINUTE]) {
      await hitRateLimit(db, "k", opts(at(ms)));
    }
    rateLimitEvent.create.mockClear();

    const refused = await hitRateLimit(db, "k", opts(at(10 * MINUTE)));
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(rateLimitEvent.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(3);
  });

  it("says how long until the oldest counted attempt leaves the window", async () => {
    const { db } = fakeDb();
    for (const ms of [0, MINUTE, 2 * MINUTE]) {
      await hitRateLimit(db, "k", opts(at(ms)));
    }
    const refused = await hitRateLimit(db, "k", opts(at(10 * MINUTE)));
    // The first attempt was at 0, so it leaves the window at one hour.
    expect(refused.retryAfterMs).toBe(50 * MINUTE);

    // Refusals are not counted, so asking again does not push that back.
    const again = await hitRateLimit(db, "k", opts(at(30 * MINUTE)));
    expect(again).toEqual({ allowed: false, remaining: 0, retryAfterMs: 30 * MINUTE });
  });

  it("allows again exactly when retryAfterMs has passed", async () => {
    const { db } = fakeDb();
    for (const ms of [0, MINUTE, 2 * MINUTE]) {
      await hitRateLimit(db, "k", opts(at(ms)));
    }
    const refused = await hitRateLimit(db, "k", opts(at(10 * MINUTE)));
    const early = at(10 * MINUTE + refused.retryAfterMs - 1);
    expect((await hitRateLimit(db, "k", opts(early))).allowed).toBe(false);

    const onTime = at(10 * MINUTE + refused.retryAfterMs);
    // Only the attempt from minute 0 has left: one slot, then full again.
    expect(await hitRateLimit(db, "k", opts(onTime))).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0,
    });
    expect((await hitRateLimit(db, "k", opts(onTime))).allowed).toBe(false);
  });

  it("starts fresh once the whole window has passed", async () => {
    const { db } = fakeDb();
    for (const ms of [0, MINUTE, 2 * MINUTE]) {
      await hitRateLimit(db, "k", opts(at(ms)));
    }
    expect(await hitRateLimit(db, "k", opts(at(2 * HOUR)))).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
  });

  it("prunes this key's events that left the window, and only those", async () => {
    const { db, rows } = fakeDb([
      { key: "k", createdAt: at(-3 * HOUR) },
      { key: "k", createdAt: at(-HOUR) }, // exactly one window old: out
      { key: "k", createdAt: at(-HOUR + 1) }, // still inside
      { key: "other", createdAt: at(-3 * HOUR) },
    ]);
    await hitRateLimit(db, "k", opts(at(0)));
    expect(rows).toEqual([
      { key: "k", createdAt: at(-HOUR + 1) },
      { key: "other", createdAt: at(-3 * HOUR) },
      { key: "k", createdAt: at(0) },
    ]);
  });

  it("prunes on a refusal too", async () => {
    const { db, rows } = fakeDb([
      { key: "k", createdAt: at(-2 * HOUR) },
      { key: "k", createdAt: at(-3 * MINUTE) },
      { key: "k", createdAt: at(-2 * MINUTE) },
      { key: "k", createdAt: at(-MINUTE) },
    ]);
    expect((await hitRateLimit(db, "k", opts(at(0)))).allowed).toBe(false);
    expect(rows.map((row) => row.createdAt)).toEqual([
      at(-3 * MINUTE),
      at(-2 * MINUTE),
      at(-MINUTE),
    ]);
  });

  it("keeps keys apart", async () => {
    const { db } = fakeDb();
    for (const ms of [0, 1, 2]) await hitRateLimit(db, "a", opts(at(ms)));
    expect((await hitRateLimit(db, "a", opts(at(3)))).allowed).toBe(false);
    expect((await hitRateLimit(db, "b", opts(at(3)))).allowed).toBe(true);
  });

  it("waits for enough attempts to leave when a race overshot the limit", async () => {
    // Four rows for a limit of three: two requests passed the count together.
    // One slot is free only once two of them are out, so the wait is measured
    // from the second oldest, not the oldest.
    const { db } = fakeDb([
      { key: "k", createdAt: at(0) },
      { key: "k", createdAt: at(MINUTE) },
      { key: "k", createdAt: at(2 * MINUTE) },
      { key: "k", createdAt: at(2 * MINUTE) },
    ]);
    const refused = await hitRateLimit(db, "k", opts(at(10 * MINUTE)));
    expect(refused).toEqual({ allowed: false, remaining: 0, retryAfterMs: 51 * MINUTE });
  });

  it("answers even when pruning fails", async () => {
    const { db, rateLimitEvent } = fakeDb();
    rateLimitEvent.deleteMany.mockRejectedValueOnce(new Error("deadlock"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await hitRateLimit(db, "k", opts(at(0)))).allowed).toBe(true);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("lets a failed count or insert escape: no answer is better than a wrong one", async () => {
    const { db, rateLimitEvent } = fakeDb();
    rateLimitEvent.findMany.mockRejectedValueOnce(new Error("connection lost"));
    await expect(hitRateLimit(db, "k", opts(at(0)))).rejects.toThrow("connection lost");
  });

  it("reads no more rows than the limit and scopes every query to the key", async () => {
    const { db, rateLimitEvent } = fakeDb();
    await hitRateLimit(db, "student-code:u1", opts(at(0)));
    const windowStart = at(-HOUR);
    expect(rateLimitEvent.findMany).toHaveBeenCalledWith({
      where: { key: "student-code:u1", createdAt: { gt: windowStart } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { createdAt: true },
    });
    expect(rateLimitEvent.deleteMany).toHaveBeenCalledWith({
      where: { key: "student-code:u1", createdAt: { lte: windowStart } },
    });
  });

  it("defaults to the current time", async () => {
    const { db, rows } = fakeDb();
    const before = Date.now();
    await hitRateLimit(db, "k", { limit: 1, windowMs: HOUR });
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(rows[0].createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it.each([
    { limit: 0, windowMs: HOUR },
    { limit: 2.5, windowMs: HOUR },
    { limit: 3, windowMs: 0 },
    { limit: 3, windowMs: Number.NaN },
  ])("rejects a nonsensical configuration ($limit, $windowMs)", async (bad) => {
    const { db, rateLimitEvent } = fakeDb();
    await expect(hitRateLimit(db, "k", bad)).rejects.toThrow("hitRateLimit needs");
    expect(rateLimitEvent.findMany).not.toHaveBeenCalled();
  });
});
