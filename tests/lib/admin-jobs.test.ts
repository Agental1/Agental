import { describe, expect, it } from "vitest";
import { runState, searchState } from "@/lib/admin/jobs";

/** The admin jobs page shows the four states staff read, from each table's own words. */
describe("job states", () => {
  it("maps search statuses", () => {
    expect(searchState("queued")).toBe("queued");
    expect(searchState("running")).toBe("running");
    expect(searchState("done")).toBe("completed");
    expect(searchState("failed")).toBe("failed");
    expect(searchState("canceled")).toBe("canceled");
    expect(searchState("weird")).toBe("failed");
  });

  it("maps workflow run statuses", () => {
    expect(runState("PENDING")).toBe("queued");
    expect(runState("RUNNING")).toBe("running");
    expect(runState("SUCCEEDED")).toBe("completed");
    expect(runState("FAILED")).toBe("failed");
    expect(runState("DEAD")).toBe("failed");
  });
});
