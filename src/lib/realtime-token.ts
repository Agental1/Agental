import { SignJWT } from "jose";

/**
 * Supabase Realtime for the notification bell (round 8c). The app signs people
 * in with its own sessions, so it signs a short Realtime token itself, with the
 * project's JWT secret: role "authenticated", sub = the app's user id. The
 * policy "agental_bell_own_topic" on realtime.messages lets that token listen to
 * "notifications:<its sub>" only (migration 20261212000000_round8c_realtime_bell).
 *
 * Needs SUPABASE_URL, SUPABASE_JWT_SECRET and a publishable key
 * (NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY). Without them the bell
 * keeps its 60-second refresh only.
 */

export const REALTIME_TOKEN_TTL_SECONDS = 60 * 60;

export type RealtimeEnv = Record<string, string | undefined>;

export interface RealtimeConfig {
  url: string;
  anonKey: string;
  secret: string;
}

export function realtimeConfig(env: RealtimeEnv = process.env): RealtimeConfig | null {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anonKey = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "").trim();
  const secret = (env.SUPABASE_JWT_SECRET ?? "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !anonKey || secret.length < 32) return null;
  return { url, anonKey, secret };
}

export function bellTopic(userId: string): string {
  return `notifications:${userId}`;
}

export async function signRealtimeToken(
  userId: string,
  config: RealtimeConfig,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: string }> {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + REALTIME_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(config.secret));
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}
