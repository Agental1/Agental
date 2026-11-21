import { describe, expect, it } from "vitest";
import {
  signCookieValue,
  signedCookieName,
  signedCookieOptions,
  timingSafeEqual,
  verifyCookieValue,
} from "@/lib/auth/signed-cookie";

const secret = "test-secret-for-signed-cookies";
const now = Date.UTC(2026, 10, 18, 12, 0, 0);

describe("signed cookie values", () => {
  it("round-trips a payload and strips exp", async () => {
    const value = await signCookieValue("oauth-intent", { mode: "signup", kind: "TALENT" }, { secret, now });
    expect(await verifyCookieValue("oauth-intent", value, { secret, now })).toEqual({
      mode: "signup",
      kind: "TALENT",
    });
  });

  it("refuses a tampered payload", async () => {
    const value = await signCookieValue("oauth-intent", { kind: "TALENT" }, { secret, now });
    const [, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ kind: "CASTING", exp: now / 1000 + 600 }))
      .toString("base64url");
    expect(await verifyCookieValue("oauth-intent", `${forged}.${sig}`, { secret, now })).toBeNull();
  });

  it("refuses a tampered signature", async () => {
    const value = await signCookieValue("oauth-intent", { kind: "TALENT" }, { secret, now });
    // A middle character: the last one carries padding bits that decode away.
    const [body, sig] = value.split(".");
    const i = 10;
    const flipped = `${body}.${sig.slice(0, i)}${sig[i] === "A" ? "B" : "A"}${sig.slice(i + 1)}`;
    expect(await verifyCookieValue("oauth-intent", flipped, { secret, now })).toBeNull();
  });

  it("refuses an expired value", async () => {
    const value = await signCookieValue("pending-oauth", { sub: "1" }, { secret, now, ttlSeconds: 600 });
    expect(await verifyCookieValue("pending-oauth", value, { secret, now: now + 599_000 })).not.toBeNull();
    expect(await verifyCookieValue("pending-oauth", value, { secret, now: now + 600_000 })).toBeNull();
  });

  it("refuses a value signed for another label", async () => {
    const value = await signCookieValue("oauth-intent", { sub: "1" }, { secret, now });
    expect(await verifyCookieValue("pending-oauth", value, { secret, now })).toBeNull();
  });

  it("refuses a value signed with another secret", async () => {
    const value = await signCookieValue("oauth-intent", { sub: "1" }, { secret, now });
    expect(await verifyCookieValue("oauth-intent", value, { secret: "other", now })).toBeNull();
  });

  it("refuses garbage without throwing", async () => {
    for (const junk of ["", "abc", "a.b.c", "!!!.???", "e30.", undefined, null]) {
      expect(await verifyCookieValue("oauth-intent", junk, { secret, now })).toBeNull();
    }
  });

  it("refuses to sign without a secret", async () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      await expect(signCookieValue("oauth-intent", {}, {})).rejects.toThrow(/AUTH_SECRET/);
    } finally {
      if (saved !== undefined) process.env.AUTH_SECRET = saved;
    }
  });
});

describe("timingSafeEqual", () => {
  it("compares bytes", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("cookie attributes", () => {
  it("uses the __Secure- prefix and SameSite=None on https", () => {
    expect(signedCookieName("oauth-intent", true)).toBe("__Secure-agental.oauth-intent");
    expect(signedCookieOptions(true, "/api/auth")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/api/auth",
      maxAge: 600,
    });
  });

  it("falls back to Lax without Secure on http", () => {
    // SameSite=None without Secure is rejected by every current browser.
    expect(signedCookieName("oauth-intent", false)).toBe("agental.oauth-intent");
    expect(signedCookieOptions(false)).toMatchObject({ secure: false, sameSite: "lax", path: "/" });
  });
});
