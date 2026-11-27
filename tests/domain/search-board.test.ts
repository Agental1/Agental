import { describe, expect, it } from "vitest";
import { clampScore, groupByLane, laneOf, meterPercent, needsPolling, type BoardSearch } from "@/domain/search-board";

const s = (id: string, status: string, o: Partial<BoardSearch> = {}): BoardSearch => ({
  id,
  status,
  createdAt: "2026-11-01T10:00:00Z",
  scheduledFor: null,
  startedAt: null,
  completedAt: null,
  ...o,
});

describe("search board helpers", () => {
  it("maps statuses to lanes and drops failed or canceled", () => {
    expect(laneOf("queued")).toBe("queued");
    expect(laneOf("running")).toBe("running");
    expect(laneOf("done")).toBe("done");
    expect(laneOf("failed")).toBeNull();
    expect(laneOf("canceled")).toBeNull();
  });

  it("groups and orders the lanes", () => {
    const g = groupByLane([
      s("q2", "queued", { scheduledFor: "2026-11-02T10:00:00Z" }),
      s("q1", "queued", { scheduledFor: "2026-11-01T12:00:00Z" }),
      s("d1", "done", { completedAt: "2026-11-03T10:00:00Z" }),
      s("d2", "done", { completedAt: "2026-11-04T10:00:00Z" }),
      s("f", "failed"),
      s("r", "running"),
    ]);
    expect(g.queued.map((x) => x.id)).toEqual(["q1", "q2"]);
    expect(g.running.map((x) => x.id)).toEqual(["r"]);
    expect(g.done.map((x) => x.id)).toEqual(["d2", "d1"]);
  });

  it("limits the done lane", () => {
    const many = Array.from({ length: 9 }, (_, i) => s(`d${i}`, "done"));
    expect(groupByLane(many, 4).done).toHaveLength(4);
  });

  it("polls only while something is queued or running", () => {
    expect(needsPolling(groupByLane([s("d", "done")]))).toBe(false);
    expect(needsPolling(groupByLane([s("q", "queued")]))).toBe(true);
    expect(needsPolling(groupByLane([s("r", "running")]))).toBe(true);
  });

  it("computes the meter", () => {
    expect(meterPercent(2, 5)).toBe(40);
    expect(meterPercent(9, 5)).toBe(100);
    expect(meterPercent(-1, 5)).toBe(0);
    expect(meterPercent(1, 0)).toBe(0);
  });

  it("clamps the match score", () => {
    expect(clampScore(62.4)).toBe(62);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(null)).toBeNull();
    expect(clampScore(NaN)).toBeNull();
  });
});
