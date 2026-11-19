import { describe, expect, it, vi } from "vitest";

/**
 * Which plan a talent has, and how long the months included with a Limelight
 * purchase run. Both are pure rules over dates, where an off-by-one is
 * invisible until a talent loses a month they paid for.
 */

// The module also exports getTalentPlan, which defaults to the real client.
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { addMonthsUtc, effectivePlan, extendComp, getTalentPlan } = await import(
  "@/lib/billing/entitlement"
);

const now = new Date("2026-11-19T10:00:00Z");
const later = new Date("2027-03-19T10:00:00Z");
const earlier = new Date("2026-11-19T09:59:59Z");

function sub(over: Partial<Parameters<typeof effectivePlan>[0] & object> = {}) {
  return { plan: "FREE", status: "ACTIVE", compPlan: null, compUntil: null, ...over };
}

describe("effectivePlan", () => {
  it("is FREE with no subscription at all", () => {
    expect(effectivePlan(null, now)).toEqual({ plan: "FREE", proUntil: null, source: "none" });
  });

  it("is FREE on a Free subscription with nothing included", () => {
    expect(effectivePlan(sub(), now)).toEqual({ plan: "FREE", proUntil: null, source: "none" });
  });

  it.each(["PRO", "PREMIUM", "ULTIMATE"])("follows an active paid %s plan", (plan) => {
    expect(effectivePlan(sub({ plan }), now)).toEqual({
      plan,
      proUntil: null,
      source: "subscription",
    });
  });

  it("gives the included plan while it runs", () => {
    expect(effectivePlan(sub({ compPlan: "PRO", compUntil: later }), now)).toEqual({
      plan: "PRO",
      proUntil: later,
      source: "limelight",
    });
  });

  it("lets an active paid plan win over the included one", () => {
    // Premium is paid for: the included Pro must not downgrade it.
    expect(
      effectivePlan(sub({ plan: "PREMIUM", compPlan: "PRO", compUntil: later }), now)
    ).toEqual({ plan: "PREMIUM", proUntil: null, source: "subscription" });
  });

  it.each(["PAST_DUE", "CANCELED"])(
    "falls back to the included plan when the paid one is %s",
    (status) => {
      expect(
        effectivePlan(sub({ plan: "PREMIUM", status, compPlan: "PRO", compUntil: later }), now)
      ).toEqual({ plan: "PRO", proUntil: later, source: "limelight" });
    }
  );

  it.each(["PAST_DUE", "CANCELED"])("is FREE when the paid plan is %s and nothing is included", (status) => {
    expect(effectivePlan(sub({ plan: "ULTIMATE", status }), now).plan).toBe("FREE");
  });

  it("ends the included plan at its date, to the millisecond", () => {
    expect(effectivePlan(sub({ compPlan: "PRO", compUntil: earlier }), now).plan).toBe("FREE");
    // "after now": the instant itself is already over.
    expect(effectivePlan(sub({ compPlan: "PRO", compUntil: now }), now).plan).toBe("FREE");
    expect(
      effectivePlan(sub({ compPlan: "PRO", compUntil: new Date(now.getTime() + 1) }), now).plan
    ).toBe("PRO");
  });

  it.each([
    ["a plan name with no end date", { compPlan: "PRO", compUntil: null }],
    ["an end date with no plan name", { compPlan: null, compUntil: later }],
    ["a name that is not a talent plan", { compPlan: "STUDIO", compUntil: later }],
    ["a misspelled name", { compPlan: "pro", compUntil: later }],
    ["an included FREE", { compPlan: "FREE", compUntil: later }],
  ])("grants nothing for %s", (_label, over) => {
    expect(effectivePlan(sub(over), now)).toEqual({ plan: "FREE", proUntil: null, source: "none" });
  });

  it("ignores a paid plan name that is not a talent plan", () => {
    expect(effectivePlan(sub({ plan: "ENTERPRISE" }), now).plan).toBe("FREE");
    expect(
      effectivePlan(sub({ plan: "ENTERPRISE", compPlan: "PRO", compUntil: later }), now)
    ).toMatchObject({ plan: "PRO", source: "limelight" });
  });
});

describe("addMonthsUtc", () => {
  it.each([
    ["2026-11-19T10:00:00Z", 4, "2027-03-19T10:00:00.000Z"],
    ["2026-11-19T10:00:00Z", 12, "2027-11-19T10:00:00.000Z"],
    ["2026-01-15T00:00:00Z", 1, "2026-02-15T00:00:00.000Z"],
    // Short months: the day is clamped, never pushed into the next month.
    ["2026-01-31T08:30:00Z", 1, "2026-02-28T08:30:00.000Z"],
    ["2028-01-31T08:30:00Z", 1, "2028-02-29T08:30:00.000Z"],
    ["2026-10-31T23:59:59.999Z", 4, "2027-02-28T23:59:59.999Z"],
    ["2027-10-31T12:00:00Z", 4, "2028-02-29T12:00:00.000Z"],
    ["2026-08-31T12:00:00Z", 1, "2026-09-30T12:00:00.000Z"],
    ["2026-05-31T12:00:00Z", 12, "2027-05-31T12:00:00.000Z"],
    ["2028-02-29T12:00:00Z", 12, "2029-02-28T12:00:00.000Z"],
    // Across the year end, and near midnight UTC where local time would differ.
    ["2026-12-31T23:30:00Z", 2, "2027-02-28T23:30:00.000Z"],
    ["2026-09-01T00:15:00Z", 4, "2027-01-01T00:15:00.000Z"],
  ])("%s plus %i months is %s", (from, months, expected) => {
    expect(addMonthsUtc(new Date(from), months).toISOString()).toBe(expected);
  });

  it("does not change the date it is given", () => {
    const from = new Date("2026-01-31T08:30:00Z");
    addMonthsUtc(from, 1);
    expect(from.toISOString()).toBe("2026-01-31T08:30:00.000Z");
  });
});

describe("extendComp", () => {
  it("starts from now when nothing was included before", () => {
    expect(extendComp(null, now, 4).toISOString()).toBe("2027-03-19T10:00:00.000Z");
  });

  it("starts from now when the previous months already ended", () => {
    expect(extendComp(new Date("2026-06-30T00:00:00Z"), now, 4).toISOString()).toBe(
      "2027-03-19T10:00:00.000Z"
    );
    expect(extendComp(now, now, 4).toISOString()).toBe("2027-03-19T10:00:00.000Z");
  });

  it("adds to an end date that is still ahead", () => {
    // A second site bought two months into the first four: eight in total.
    expect(extendComp(new Date("2027-01-19T10:00:00Z"), now, 4).toISOString()).toBe(
      "2027-05-19T10:00:00.000Z"
    );
  });

  it("clamps to the end of a short month", () => {
    expect(extendComp(null, new Date("2026-10-31T09:00:00Z"), 4).toISOString()).toBe(
      "2027-02-28T09:00:00.000Z"
    );
    expect(extendComp(new Date("2027-10-31T09:00:00Z"), now, 4).toISOString()).toBe(
      "2028-02-29T09:00:00.000Z"
    );
  });
});

describe("getTalentPlan", () => {
  function mockDb(row: unknown) {
    return { subscription: { findUnique: vi.fn(async () => row) } };
  }

  it("loads the talent's subscription by user id and applies the rule", async () => {
    const db = mockDb(sub({ compPlan: "PRO", compUntil: later }));
    expect(await getTalentPlan("u1", now, db as never)).toEqual({
      plan: "PRO",
      proUntil: later,
      source: "limelight",
    });
    expect(db.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subjectId: "u1" } })
    );
  });

  it("is FREE for a talent with no subscription row", async () => {
    expect(await getTalentPlan("u1", now, mockDb(null) as never)).toEqual({
      plan: "FREE",
      proUntil: null,
      source: "none",
    });
  });
});
