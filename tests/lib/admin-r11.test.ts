import { describe, expect, it } from "vitest";
import { adminDateTime, zonedDayStart } from "@/lib/format";
import { auditLabel } from "@/domain/audit-labels";
import { canSearchCsv } from "@/lib/admin/accounts";

/** Round 11, group 1: the round 10 low items in the admin. */
describe("admin dates in one time zone", () => {
  it("starts a filter day at midnight in Los Angeles, winter and summer", () => {
    expect(zonedDayStart("2026-11-23").toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(zonedDayStart("2026-07-04").toISOString()).toBe("2026-07-04T07:00:00.000Z");
    // The day clocks go back (Nov 1, 2026) and forward (Mar 8, 2026).
    expect(zonedDayStart("2026-11-01").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(zonedDayStart("2026-03-08").toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });

  it("shows the same day the filter uses, with the zone", () => {
    const late = new Date("2026-11-23T07:30:00Z"); // Nov 22, 11:30 PM in Los Angeles
    expect(adminDateTime(late, "en-US")).toMatch(/Nov 22, 2026.*PST/);
    expect(late < zonedDayStart("2026-11-23")).toBe(true);
  });
});

describe("readable labels", () => {
  it("names audit entries in words, and stays readable for unknown ones", () => {
    expect(auditLabel("auth.email.verified")).toBe("Email verified");
    expect(auditLabel("limelight.domain.add")).toBe("Limelight: domain add");
    expect(auditLabel("admin.ai_account.save")).toBe("Admin: ai account save");
  });

  it("writes Can search in words in the CSV", () => {
    expect(canSearchCsv(null)).toBe("yes");
    expect(canSearchCsv("n/a")).toBe("not a performer");
    expect(canSearchCsv({ reason: "profile_incomplete", missing: ["photos"] })).toBe("no: profile below 100%");
  });
});
