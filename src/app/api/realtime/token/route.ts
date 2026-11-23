import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { bellTopic, realtimeConfig, signRealtimeToken } from "@/lib/realtime-token";

/**
 * GET: a one-hour Supabase Realtime token for the signed-in person's bell
 * topic (round 8c), or 404 while Realtime is not configured (the bell then
 * keeps its 60-second refresh). The token only lets its holder listen to
 * "notifications:<own id>"; it opens no table.
 */
export async function GET() {
  const config = realtimeConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 404 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token, expiresAt } = await signRealtimeToken(session.user.id, config);
  return NextResponse.json(
    { url: config.url, anonKey: config.anonKey, token, topic: bellTopic(session.user.id), expiresAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
