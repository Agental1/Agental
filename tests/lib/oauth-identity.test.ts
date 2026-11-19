import { describe, expect, it } from "vitest";
import { cleanName, identityFromProfile } from "@/lib/auth/oauth-identity";

describe("identityFromProfile: Google", () => {
  const base = { sub: "g-1", email: " Ana@Example.COM ", name: "Ana Ruiz", picture: "https://lh3.googleusercontent.com/a" };

  it("accepts a verified email and normalizes it", () => {
    expect(identityFromProfile("google", "g-1", { ...base, email_verified: true })).toEqual({
      provider: "google",
      providerAccountId: "g-1",
      email: "ana@example.com",
      emailAuthoritative: false,
      name: "Ana Ruiz",
      image: "https://lh3.googleusercontent.com/a",
    });
  });

  it("is the authority for Gmail and Workspace addresses only", () => {
    const of = (extra: Record<string, unknown>) =>
      identityFromProfile("google", "g-1", { ...base, email_verified: true, ...extra })?.emailAuthoritative;
    expect(of({ email: "ana@gmail.com" })).toBe(true);
    expect(of({ email: "Ana@GoogleMail.com" })).toBe(true);
    expect(of({ email: "ana@studio.example", hd: "studio.example" })).toBe(true);
    // Verified once by Google, hosted elsewhere: not proof of today's owner.
    expect(of({ email: "ana@yahoo.com" })).toBe(false);
    expect(of({ email: "ana@studio.example", hd: "" })).toBe(false);
    expect(of({ email: "gmail.com@evil.example" })).toBe(false);
  });

  it("requires email_verified to be exactly true", () => {
    for (const v of [false, "true", undefined, 1]) {
      expect(identityFromProfile("google", "g-1", { ...base, email_verified: v })).toBeNull();
    }
  });

  it("drops a non-https picture", () => {
    const id = identityFromProfile("google", "g-1", { ...base, email_verified: true, picture: "javascript:alert(1)" });
    expect(id?.image).toBeNull();
  });
});

describe("identityFromProfile: Apple", () => {
  const base = { sub: "a-1", email: "x@privaterelay.appleid.com" };

  it("accepts email_verified as a boolean or the string \"true\"", () => {
    expect(identityFromProfile("apple", "a-1", { ...base, email_verified: true })).not.toBeNull();
    expect(identityFromProfile("apple", "a-1", { ...base, email_verified: "true" })).not.toBeNull();
    expect(identityFromProfile("apple", "a-1", { ...base, email_verified: "false" })).toBeNull();
    expect(identityFromProfile("apple", "a-1", { ...base })).toBeNull();
  });

  it("requires an email", () => {
    expect(identityFromProfile("apple", "a-1", { sub: "a-1", email_verified: true })).toBeNull();
  });

  it("reads the first-consent name, trimmed and capped", () => {
    const id = identityFromProfile("apple", "a-1", {
      ...base,
      email_verified: true,
      user: { name: { firstName: "  Léa ", lastName: "x".repeat(200) } },
    });
    expect(id?.name?.startsWith("Léa x")).toBe(true);
    expect(id?.name?.length).toBe(100);
    expect(id?.image).toBeNull();
  });

  it("has no name after the first consent", () => {
    expect(identityFromProfile("apple", "a-1", { ...base, email_verified: true })?.name).toBeNull();
  });
});

describe("cleanName", () => {
  it("ignores non-strings and empties", () => {
    expect(cleanName(undefined, "  ", 3)).toBeNull();
    expect(cleanName("Ana", undefined)).toBe("Ana");
  });
});

describe("identityFromProfile: Apple authority", () => {
  const of = (profile: Record<string, unknown>) =>
    identityFromProfile("apple", "a-1", { sub: "a-1", email_verified: "true", ...profile })?.emailAuthoritative;

  it("vouches for a real address and never for a relay one", () => {
    expect(of({ email: "ana@icloud.com" })).toBe(true);
    expect(of({ email: "ana@example.com", is_private_email: false })).toBe(true);
    expect(of({ email: "x1y2@privaterelay.appleid.com" })).toBe(false);
    expect(of({ email: "ana@example.com", is_private_email: "true" })).toBe(false);
    expect(of({ email: "ana@example.com", is_private_email: true })).toBe(false);
  });
});
