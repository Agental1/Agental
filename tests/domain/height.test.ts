import { describe, expect, it } from "vitest";
import {
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  HeightInput,
  cmToFtIn,
  defaultHeightUnit,
  fieldsFromCm,
  fieldsFromValue,
  formatHeight,
  ftInToCm,
  heightFromFields,
  heightToCm,
  initialHeightUnit,
  switchHeightUnit,
  type HeightUnit,
  type HeightValue,
} from "@/domain/height";

const BLANK = { feet: "", inches: "", cm: "" };
const other = (unit: HeightUnit): HeightUnit => (unit === "imperial" ? "metric" : "imperial");

describe("ftInToCm / cmToFtIn", () => {
  it("converts common heights", () => {
    expect(ftInToCm(5, 7)).toBe(170);
    expect(ftInToCm(6, 0)).toBe(183);
    expect(cmToFtIn(170)).toEqual({ feet: 5, inches: 7 });
    expect(cmToFtIn(183)).toEqual({ feet: 6, inches: 0 });
  });

  it("maps the bounds 3'0\" and 7'11\" to 91 and 241 cm and back", () => {
    expect(ftInToCm(3, 0)).toBe(HEIGHT_MIN_CM);
    expect(ftInToCm(7, 11)).toBe(HEIGHT_MAX_CM);
    expect(cmToFtIn(HEIGHT_MIN_CM)).toEqual({ feet: 3, inches: 0 });
    expect(cmToFtIn(HEIGHT_MAX_CM)).toEqual({ feet: 7, inches: 11 });
  });

  it("rolls 11.6 inches over to the next foot instead of showing 12 in", () => {
    // 182 cm = 71.65 in, rounds to 72 = 6'0"
    expect(cmToFtIn(182)).toEqual({ feet: 6, inches: 0 });
  });

  it("round-trips every inch in range", () => {
    for (let feet = 3; feet <= 7; feet++) {
      for (let inches = 0; inches < 12; inches++) {
        expect(cmToFtIn(ftInToCm(feet, inches))).toEqual({ feet, inches });
      }
    }
  });
});

describe("HeightInput", () => {
  it("accepts imperial and metric and returns centimeters", () => {
    expect(HeightInput.parse({ unit: "imperial", feet: 5, inches: 7 })).toBe(170);
    expect(HeightInput.parse({ unit: "metric", cm: 175 })).toBe(175);
  });

  it("accepts both bounds", () => {
    expect(HeightInput.parse({ unit: "imperial", feet: 3, inches: 0 })).toBe(91);
    expect(HeightInput.parse({ unit: "imperial", feet: 7, inches: 11 })).toBe(241);
    expect(HeightInput.parse({ unit: "metric", cm: 91 })).toBe(91);
    expect(HeightInput.parse({ unit: "metric", cm: 241 })).toBe(241);
  });

  it.each([
    { unit: "imperial", feet: 2, inches: 11 },
    { unit: "imperial", feet: 8, inches: 0 },
    { unit: "imperial", feet: 5, inches: 12 },
    { unit: "imperial", feet: Number.NaN, inches: 0 },
    { unit: "metric", cm: 90 },
    { unit: "metric", cm: 242 },
    { unit: "metric", cm: 170.5 },
    { unit: "metric", cm: 0 },
  ])("refuses %o with the range key", (value) => {
    const result = HeightInput.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("errors.heightRange");
  });

  it("refuses strings instead of coercing them", () => {
    expect(HeightInput.safeParse({ unit: "metric", cm: "" }).success).toBe(false);
  });
});

describe("heightFromFields", () => {
  it("is undefined when every field is blank, in both units", () => {
    expect(heightFromFields("imperial", { feet: "", inches: "", cm: "" })).toBeUndefined();
    expect(heightFromFields("metric", { feet: "5", inches: "7", cm: " " })).toBeUndefined();
  });

  it("reads blank inches next to a foot count as 0", () => {
    expect(heightFromFields("imperial", { feet: "6", inches: "", cm: "" })).toEqual({
      unit: "imperial",
      feet: 6,
      inches: 0,
    });
  });

  it("passes inches without feet through so the server refuses them", () => {
    const value = heightFromFields("imperial", { feet: "", inches: "4", cm: "" });
    expect(value).toBeDefined();
    expect(HeightInput.safeParse(value).success).toBe(false);
  });

  it("reads centimeters in metric", () => {
    expect(heightFromFields("metric", { feet: "", inches: "", cm: "180" })).toEqual({
      unit: "metric",
      cm: 180,
    });
  });

  it("prefills from a stored height", () => {
    expect(fieldsFromCm(170)).toEqual({ feet: "5", inches: "7", cm: "170" });
    expect(fieldsFromCm(undefined)).toEqual({ feet: "", inches: "", cm: "" });
  });
});

describe("heightToCm", () => {
  it("gives centimeters for a value the server accepts, undefined otherwise", () => {
    expect(heightToCm({ unit: "imperial", feet: 5, inches: 10 })).toBe(178);
    expect(heightToCm({ unit: "metric", cm: 171 })).toBe(171);
    expect(heightToCm({ unit: "imperial", feet: Number.NaN, inches: 7 })).toBeUndefined();
    expect(heightToCm({ unit: "metric", cm: 50 })).toBeUndefined();
    expect(heightToCm(undefined)).toBeUndefined();
  });
});

describe("switchHeightUnit", () => {
  it("keeps every untouched stored height exact, both ways and back", () => {
    // Rebuilding centimeters from feet and inches used to save 170 for a
    // stored 171, for 91 of the 151 heights in range.
    for (let cm = HEIGHT_MIN_CM; cm <= HEIGHT_MAX_CM; cm++) {
      for (const from of ["imperial", "metric"] as const) {
        const there = switchHeightUnit(from, fieldsFromCm(cm), false);
        expect(there).toEqual({ fields: fieldsFromCm(cm), cleared: false });
        const back = switchHeightUnit(other(from), there.fields, false);
        expect(heightFromFields("metric", back.fields)).toEqual({ unit: "metric", cm });
      }
    }
  });

  it("fills the other unit from an edited entry's exact value", () => {
    // 5 ft 10 in picked over a stored 170.
    expect(switchHeightUnit("imperial", { feet: "5", inches: "10", cm: "170" }, true)).toEqual({
      fields: { feet: "5", inches: "10", cm: "178" },
      cleared: false,
    });
    // 172 typed over a stored 5 ft 7 in: the centimeters stay as typed.
    expect(switchHeightUnit("metric", { feet: "5", inches: "7", cm: "172" }, true)).toEqual({
      fields: { feet: "5", inches: "8", cm: "172" },
      cleared: false,
    });
  });

  it("keeps a cleared height cleared instead of bringing back the other unit", () => {
    expect(switchHeightUnit("imperial", { feet: "", inches: "", cm: "170" }, true)).toEqual({
      fields: BLANK,
      cleared: false,
    });
    expect(switchHeightUnit("metric", { feet: "5", inches: "7", cm: "" }, true)).toEqual({
      fields: BLANK,
      cleared: false,
    });
  });

  it("drops an entry the other unit cannot show and asks to report it cleared", () => {
    // Feet cleared next to a chosen inch count, then the toggle: the stale
    // centimeters used to come back as the value.
    expect(switchHeightUnit("imperial", { feet: "", inches: "7", cm: "170" }, true)).toEqual({
      fields: BLANK,
      cleared: true,
    });
    expect(switchHeightUnit("metric", { feet: "5", inches: "7", cm: "50" }, true)).toEqual({
      fields: BLANK,
      cleared: true,
    });
  });
});

describe("fieldsFromValue and initialHeightUnit", () => {
  it("reopen a field on the value it last reported", () => {
    // Back from the mandate step after picking 5 ft 10 in: the field used to
    // reopen blank, or on the page-load height, while 178 was still sent.
    const picked: HeightValue = { unit: "imperial", feet: 5, inches: 10 };
    expect(fieldsFromValue(picked)).toEqual({ feet: "5", inches: "10", cm: "178" });
    expect(initialHeightUnit(picked, "fr")).toBe("imperial");
    expect(heightFromFields(initialHeightUnit(picked, "fr"), fieldsFromValue(picked))).toEqual(picked);
  });

  it("open a stored height on the locale's unit, centimeters kept exact", () => {
    const stored: HeightValue = { unit: "metric", cm: 171 };
    expect(fieldsFromValue(stored)).toEqual({ feet: "5", inches: "7", cm: "171" });
    expect(initialHeightUnit(stored, "en")).toBe("imperial");
    expect(initialHeightUnit(stored, "fr")).toBe("metric");
    expect(fieldsFromValue(undefined)).toEqual(BLANK);
    expect(initialHeightUnit(undefined, "zh")).toBe("metric");
  });

  it("show an entry the server would refuse as typed, in the unit that can hold it", () => {
    // The editor used to reopen on the last valid height while Save still
    // sent the refused entry.
    const short: HeightValue = { unit: "metric", cm: 50 };
    expect(fieldsFromValue(short)).toEqual({ feet: "", inches: "", cm: "50" });
    expect(initialHeightUnit(short, "en")).toBe("metric");
    expect(heightFromFields("metric", fieldsFromValue(short))).toEqual(short);

    const inchesOnly: HeightValue = { unit: "imperial", feet: Number.NaN, inches: 7 };
    expect(fieldsFromValue(inchesOnly)).toEqual({ feet: "", inches: "7", cm: "" });
    expect(initialHeightUnit(inchesOnly, "fr")).toBe("imperial");
  });

  it("read back every value in range unchanged", () => {
    for (let feet = 3; feet <= 7; feet++) {
      for (let inches = 0; inches < 12; inches++) {
        const value: HeightValue = { unit: "imperial", feet, inches };
        expect(heightFromFields(initialHeightUnit(value, "en"), fieldsFromValue(value))).toEqual(value);
      }
    }
    for (let cm = HEIGHT_MIN_CM; cm <= HEIGHT_MAX_CM; cm++) {
      const value: HeightValue = { unit: "metric", cm };
      expect(heightFromFields("metric", fieldsFromValue(value))).toEqual(value);
    }
  });
});

describe("formatHeight", () => {
  // ICU puts narrow no-break spaces in some locales (fr: "170\u202fcm").
  const show = (...args: Parameters<typeof formatHeight>) =>
    formatHeight(...args).replace(/\s/g, " ");

  it("shows feet and inches in English", () => {
    expect(show(170, "en")).toBe("5 ft 7 in");
    expect(show(183, "en")).toBe("6 ft");
  });

  it("shows centimeters in the other locales", () => {
    expect(show(170, "fr")).toBe("170 cm");
    expect(show(170, "es")).toBe("170 cm");
    expect(show(170, "zh")).toBe("170厘米");
  });

  it("joins units the way the locale does when asked for imperial", () => {
    expect(show(170, "zh", "imperial")).toBe("5英尺7英寸");
    expect(show(170, "en", "metric")).toBe("170 cm");
  });

  it("defaults the unit by locale", () => {
    expect(defaultHeightUnit("en")).toBe("imperial");
    expect(defaultHeightUnit("en-US")).toBe("imperial");
    for (const l of ["fr", "es", "zh"]) expect(defaultHeightUnit(l)).toBe("metric");
  });
});
