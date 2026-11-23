import { describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { bellTopic, realtimeConfig, signRealtimeToken } from "@/lib/realtime-token";

const env = {
  SUPABASE_URL: "https://abcdefghijklmnop.supabase.co/",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
  SUPABASE_JWT_SECRET: "x".repeat(40),
};

describe("Realtime token for the bell (round 8c)", () => {
  it("is off until the URL, the publishable key and the secret are all set", () => {
    expect(realtimeConfig({})).toBeNull();
    expect(realtimeConfig({ ...env, SUPABASE_JWT_SECRET: "" })).toBeNull();
    expect(realtimeConfig({ ...env, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })).toBeNull();
    expect(realtimeConfig({ ...env, SUPABASE_URL: "https://evil.example.com" })).toBeNull();
    expect(realtimeConfig(env)).toEqual({
      url: "https://abcdefghijklmnop.supabase.co",
      anonKey: "sb_publishable_test",
      secret: env.SUPABASE_JWT_SECRET,
    });
  });

  it("signs a one-hour token for this person only, as the authenticated role", async () => {
    const config = realtimeConfig(env)!;
    const now = new Date("2026-11-22T12:00:00Z");
    const { token, expiresAt } = await signRealtimeToken("user_1", config, now);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.secret), {
      audience: "authenticated",
      currentDate: now,
    });
    expect(payload.sub).toBe("user_1");
    expect(payload.role).toBe("authenticated");
    expect(expiresAt).toBe("2026-11-22T13:00:00.000Z");
    expect(bellTopic("user_1")).toBe("notifications:user_1");
  });
});
