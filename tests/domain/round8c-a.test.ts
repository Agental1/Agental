import { describe, expect, it } from "vitest";
import { joinMulti, splitMulti } from "@/domain/identity";
import { pickSearchView } from "@/domain/search-view";

describe("Build with several choices (round 8c)", () => {
  it("reads an old single value as a list of one", () => {
    expect(splitMulti("Athletic")).toEqual(["Athletic"]);
    expect(splitMulti("")).toEqual([]);
    expect(splitMulti(undefined)).toEqual([]);
  });
  it("round-trips several choices", () => {
    const v = joinMulti(["Athletic", "Muscular", "Tall and wiry"]);
    expect(v).toBe("Athletic, Muscular, Tall and wiry");
    expect(splitMulti(v)).toEqual(["Athletic", "Muscular", "Tall and wiry"]);
  });
  it("keeps a typed comma from splitting one choice", () => {
    expect(splitMulti(joinMulti(["lean, toned"]))).toEqual(["lean toned"]);
  });
});

describe("Applications buttons (round 8c)", () => {
  const counts = { queue: 1, running: 0, finished: 3 };
  it("opens the button asked for, old anchors included", () => {
    expect(pickSearchView("queue", counts)).toBe("queue");
    expect(pickSearchView("search-running", counts)).toBe("running");
    expect(pickSearchView(["finished"], counts)).toBe("finished");
  });
  it("otherwise opens where something is happening", () => {
    expect(pickSearchView(undefined, counts)).toBe("finished");
    expect(pickSearchView(undefined, { queue: 1, running: 1, finished: 3 })).toBe("running");
    expect(pickSearchView("nonsense", { queue: 2, running: 0, finished: 0 })).toBe("queue");
  });
});
