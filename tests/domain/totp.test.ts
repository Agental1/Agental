import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, otpauthUri, totpCode, verifyTotp, stepAt } from "@/domain/totp";

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" (last 6 of the 8 digits).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (round 8d admin second factor)", () => {
  it("base32 round-trips", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(Buffer.from(base32Decode(RFC_SECRET)).toString()).toBe("12345678901234567890");
  });

  it("matches the RFC 6238 test vectors", () => {
    expect(totpCode(RFC_SECRET, stepAt(new Date(59_000)))).toBe("287082");
    expect(totpCode(RFC_SECRET, stepAt(new Date(1_111_111_109_000)))).toBe("081804");
    expect(totpCode(RFC_SECRET, stepAt(new Date(1_234_567_890_000)))).toBe("005924");
  });

  it("accepts one step of drift, refuses older codes and a code used twice", () => {
    const now = new Date(1_234_567_890_000);
    const step = stepAt(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
  });

  it("builds the otpauth link an app scans", () => {
    expect(otpauthUri("ABC", "a@b.co")).toBe(
      "otpauth://totp/Agental%3Aa%40b.co?secret=ABC&issuer=Agental&algorithm=SHA1&digits=6&period=30"
    );
  });
});
