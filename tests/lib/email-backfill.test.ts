import { describe, expect, it } from "vitest";
import { planEmailBackfill } from "@/lib/auth/email-backfill";

describe("planEmailBackfill", () => {
  it("rewrites mixed-case emails and leaves normalized ones alone", () => {
    const plan = planEmailBackfill([
      { id: "1", email: "Ana@Example.com" },
      { id: "2", email: "bob@example.com" },
      { id: "3", email: " carla@example.com " },
    ]);
    expect(plan.updates).toEqual([
      { id: "1", from: "Ana@Example.com", to: "ana@example.com" },
      { id: "3", from: " carla@example.com ", to: "carla@example.com" },
    ]);
    expect(plan.collisions).toEqual([]);
  });

  it("reports collisions and changes none of their rows", () => {
    const plan = planEmailBackfill([
      { id: "1", email: "Ana@x.com" },
      { id: "2", email: "ana@x.com" },
    ]);
    expect(plan.updates).toEqual([]);
    expect(plan.collisions).toEqual([
      { normalized: "ana@x.com", rows: [{ id: "1", email: "Ana@x.com" }, { id: "2", email: "ana@x.com" }] },
    ]);
  });
});
