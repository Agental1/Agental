import { describe, expect, it } from "vitest";
import { cleanName, identityFromProfile } from "@/lib/auth/oauth-identity";

describe("identityFromProfile: Google", () => {
  const base = { sub: "g-1", email: " Ana@Example.COM ", name: "Ana Ruiz", picture: "https://lh3.googleusercontent.com/a" };

  it("accepts a verified email and normalizes it", () => {
    expect(identityFromProfile("google", "g-1", { ...base, email_verified: true })).toEqual({
      provider: "google",
      providerAccountId: "g-1",
      email: "ana@example.com",
      name: "Ana Ruiz",
      image: "https://lh3.googleusercontent.com/a",
    });
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
