import { describe, expect, it } from "vitest";
import { relinkNeeds } from "@/domain/relink";

describe("relinkNeeds (round 8c)", () => {
  const base = { city: null, cityGeonameId: null, phone: null, phoneE164: null };
  it("asks nothing of an empty or linked profile", () => {
    expect(relinkNeeds(base)).toEqual({ city: false, phone: false });
    expect(relinkNeeds({ city: "Austin", cityGeonameId: 4671654, phone: "(512) 555-0100", phoneE164: "+15125550100" })).toEqual({
      city: false,
      phone: false,
    });
  });
  it("asks for the city typed but never picked, and the number never checked", () => {
    expect(relinkNeeds({ ...base, city: "Brooklyn-ish" })).toEqual({ city: true, phone: false });
    expect(relinkNeeds({ ...base, phone: "555 0100" })).toEqual({ city: false, phone: true });
  });
  it("ignores blank text and treats an empty E.164 as unchecked", () => {
    expect(relinkNeeds({ ...base, city: "   ", phone: " " })).toEqual({ city: false, phone: false });
    expect(relinkNeeds({ ...base, phone: "555", phoneE164: "" })).toEqual({ city: false, phone: true });
    expect(relinkNeeds({ ...base, city: "Paris", cityGeonameId: 0 })).toEqual({ city: false, phone: false });
  });
});
