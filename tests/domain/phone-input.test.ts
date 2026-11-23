import { describe, expect, it } from "vitest";
import { changeCountry, editPhone } from "@/domain/phone-input";

/** Type a string one character at a time at the end, as a person would. */
function typeAll(chars: string, country: "US" | "FR" = "US") {
  let text = "";
  let cc: string = country;
  for (const ch of chars) {
    const r = editPhone({ prev: text, next: text + ch, caret: text.length + 1, country: cc as "US" });
    text = r.text;
    cc = r.country;
  }
  return editPhone({ prev: text, next: text, caret: text.length, country: cc as "US" });
}

describe("phone field (round 10)", () => {
  it("formats as typed and saves E.164", () => {
    const r = typeAll("2135550123");
    expect(r.text).toBe("(213) 555-0123");
    expect(r.e164).toBe("+12135550123");
  });

  it.each(["+1 213 555 0123", "213-555-0123", "(213) 5550123", "2135550123", "+12135550123"])(
    "accepts a paste of %s",
    (pasted) => {
      const r = editPhone({ prev: "", next: pasted, caret: pasted.length, country: "US" });
      expect(r.e164).toBe("+12135550123");
      expect(r.country).toBe("US");
      expect(r.text).toBe("(213) 555-0123");
    }
  );

  it("picks the country from a pasted international number", () => {
    const r = editPhone({ prev: "", next: "+33 6 12 34 56 78", caret: 17, country: "US" });
    expect(r.country).toBe("FR");
    expect(r.e164).toBe("+33612345678");
  });

  it("keeps the caret after the same digit when typing in the middle", () => {
    // "(213) 555-012": insert 5 after "(21"
    const prev = "(213) 555-012";
    const next = "(215" + "3) 555-012";
    const r = editPhone({ prev, next, caret: 4, country: "US" });
    expect(r.text).toBe("(215) 355-5012");
    expect(r.text.slice(0, r.caret)).toBe("(215");
  });

  it("deletes one digit per Backspace, including over a parenthesis or a space", () => {
    let text = "(213) 555-0123";
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const caret = text.length;
      const next = text.slice(0, caret - 1);
      const r = editPhone({ prev: text, next, caret: caret - 1, country: "US" });
      text = r.text;
      seen.push(text.replace(/\D/g, ""));
    }
    expect(seen).toEqual(["213555012", "21355501", "2135550", "213555", "21355", "2135", "213", "21", "2", ""]);
  });

  it("Backspace right after the closing parenthesis removes the 3", () => {
    const prev = "(213) 2";
    // caret after ")" (index 5), Backspace removes ")"
    const r = editPhone({ prev, next: "(213 2", caret: 4, country: "US" });
    expect(r.text.replace(/\D/g, "")).toBe("212");
  });

  it("Delete before a formatting character removes the next digit", () => {
    const prev = "(213) 555-0123";
    // caret before "-" (index 9), Delete removes "-"
    const r = editPhone({ prev, next: "(213) 5550123", caret: 9, country: "US", forward: true });
    expect(r.text.replace(/\D/g, "")).toBe("213555123");
  });

  it("reformats when the country changes", () => {
    const r = changeCountry("612345678", "FR");
    expect(r.e164).toBe("+33612345678");
    expect(r.text).toBe("06 12 34 56 78");
  });

  it("a pasted +number replaces digits already in the field", () => {
    const r = editPhone({ prev: "(213) 2", next: "(213) 2+1 213 555 0123", caret: 22, country: "FR" });
    expect(r.e164).toBe("+12135550123");
    expect(r.country).toBe("US");
  });

  it("an empty field is empty, not invalid", () => {
    const r = editPhone({ prev: "2", next: "", caret: 0, country: "US" });
    expect(r.empty).toBe(true);
    expect(r.e164).toBeNull();
  });
});
