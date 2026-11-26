import { describe, expect, it } from "vitest";
import { describeTapeDuration, formatClock, parseMaxDurationSeconds } from "@/domain/tape-duration";

describe("parseMaxDurationSeconds", () => {
  it.each([
    ["Monologue, under 3 minutes", 180],
    ["max 90 seconds", 90],
    ["2 min", 120],
    ["1:30", 90],
    ["Up to 1.5 minutes", 90],
    ["2 minutes 30 seconds", 150],
  ])("%s", (text, expected) => expect(parseMaxDurationSeconds(text)).toBe(expected));

  it("gives null when no length is stated", () => {
    expect(parseMaxDurationSeconds("Two pages of sides")).toBeNull();
    expect(parseMaxDurationSeconds("")).toBeNull();
    expect(parseMaxDurationSeconds(null)).toBeNull();
    expect(parseMaxDurationSeconds("0 minutes")).toBeNull();
  });
});

describe("describeTapeDuration", () => {
  it("formats the clock", () => expect(formatClock(168)).toBe("2:48"));
  it("within the limit", () =>
    expect(describeTapeDuration(168, 180)).toEqual({ status: "within", clock: "2:48", limit: { unit: "minutes", value: 3 } }));
  it("exactly at the limit is within", () =>
    expect(describeTapeDuration(180, 180).status).toBe("within"));
  it("over by seconds", () =>
    expect(describeTapeDuration(220, 180)).toMatchObject({ status: "over", clock: "3:40", overMinutes: 0, overSeconds: 40 }));
  it("over by minutes and seconds", () =>
    expect(describeTapeDuration(305, 180)).toMatchObject({ status: "over", overMinutes: 2, overSeconds: 5 }));
  it("no limit shows the duration only", () => {
    expect(describeTapeDuration(168)).toEqual({ status: "plain", clock: "2:48" });
    expect(describeTapeDuration(168, null).status).toBe("plain");
  });
  it("zero, NaN and missing durations are unknown", () => {
    for (const d of [0, NaN, Infinity, -4, null, undefined]) expect(describeTapeDuration(d, 180).status).toBe("unknown");
  });
  it("names short and odd limits", () => {
    expect(describeTapeDuration(30, 90)).toMatchObject({ limit: { unit: "seconds", value: 90 } });
    expect(describeTapeDuration(30, 150)).toMatchObject({ limit: { unit: "clock", clock: "2:30" } });
  });
});
