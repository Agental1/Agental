import { afterEach, describe, expect, it } from "vitest";
import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import {
  appleClientSecret,
  appleSecretMode,
  isOAuthProviderId,
  oauthProvidersFromEnv,
  resetAppleSecretCache,
} from "@/lib/auth/oauth-providers";

// The signIn callback in src/auth.ts refuses any provider this guard rejects.
describe("isOAuthProviderId", () => {
  it("accepts the two providers this app implements", () => {
    expect(isOAuthProviderId("google")).toBe(true);
    expect(isOAuthProviderId("apple")).toBe(true);
  });

  it("rejects credentials, unknown ids, prototype keys and non-strings", () => {
    expect(isOAuthProviderId("credentials")).toBe(false);
    expect(isOAuthProviderId("github")).toBe(false);
    expect(isOAuthProviderId("Google")).toBe(false);
    expect(isOAuthProviderId("toString")).toBe(false);
    expect(isOAuthProviderId("")).toBe(false);
    expect(isOAuthProviderId(undefined)).toBe(false);
    expect(isOAuthProviderId(["google"])).toBe(false);
  });
});

describe("oauthProvidersFromEnv", () => {
  it("enables nothing without OAuth variables", () => {
    expect(oauthProvidersFromEnv({})).toEqual([]);
    expect(oauthProvidersFromEnv({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "" })).toEqual([]);
  });

  it("enables Google with both id and secret", () => {
    expect(oauthProvidersFromEnv({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).toEqual(["google"]);
  });

  it("enables Apple with a pasted secret or the signing parts", () => {
    expect(appleSecretMode({ AUTH_APPLE_ID: "co.agental.web", AUTH_APPLE_SECRET: "jwt" })).toBe("static");
    expect(
      appleSecretMode({
        AUTH_APPLE_ID: "co.agental.web",
        AUTH_APPLE_TEAM_ID: "T",
        AUTH_APPLE_KEY_ID: "K",
        AUTH_APPLE_PRIVATE_KEY: "pem",
      })
    ).toBe("signed");
    expect(appleSecretMode({ AUTH_APPLE_ID: "co.agental.web", AUTH_APPLE_TEAM_ID: "T" })).toBeNull();
    expect(appleSecretMode({ AUTH_APPLE_SECRET: "jwt" })).toBeNull();
    expect(
      oauthProvidersFromEnv({
        AUTH_GOOGLE_ID: "id",
        AUTH_GOOGLE_SECRET: "s",
        AUTH_APPLE_ID: "co.agental.web",
        AUTH_APPLE_SECRET: "jwt",
      })
    ).toEqual(["google", "apple"]);
  });
});

describe("appleClientSecret", () => {
  afterEach(() => resetAppleSecretCache());

  it("returns a pasted secret as is", async () => {
    expect(await appleClientSecret({ AUTH_APPLE_SECRET: "pasted" })).toBe("pasted");
  });

  it("signs an ES256 JWT Apple accepts, and caches it", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const env = {
      AUTH_APPLE_ID: "co.agental.web",
      AUTH_APPLE_TEAM_ID: "TEAM123456",
      AUTH_APPLE_KEY_ID: "KEY1234567",
      // As a hosting dashboard stores it: literal \n sequences.
      AUTH_APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
    };
    const now = Date.now();
    const secret = await appleClientSecret(env, now);

    expect(decodeProtectedHeader(secret)).toMatchObject({ alg: "ES256", kid: "KEY1234567" });
    const { payload } = await jwtVerify(secret, publicKey, {
      issuer: "TEAM123456",
      subject: "co.agental.web",
      audience: "https://appleid.apple.com",
    });
    expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);

    expect(await appleClientSecret(env, now + 60_000)).toBe(secret);
    const later = await appleClientSecret(env, now + 23 * 60 * 60 * 1000 + 1000);
    expect(decodeJwt(later).iat).toBeGreaterThan(payload.iat!);
  });
});
