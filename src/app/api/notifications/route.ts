import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { bellFor, markAllRead, markOneRead } from "@/lib/notifications";

/**
 * The bell's data (round 8). GET: the latest items and the unread count; the
 * bell asks every 60 seconds, and at once when a Supabase Realtime signal says
 * something new arrived (round 8c, /api/realtime/token). POST {all: true} or
 * {key}: mark read. Signed-in people only, their own items only.
 */
function portalOf(kind: string | undefined): "TALENT" | "CASTING" {
  return kind === "CASTING" ? "CASTING" : "TALENT";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await bellFor(session.user.id, portalOf(session.user.kind));
  return NextResponse.json({ ...data, now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; key?: string };
  if (body.all) await markAllRead(session.user.id, portalOf(session.user.kind));
  else if (typeof body.key === "string" && body.key.length < 80) await markOneRead(session.user.id, body.key, portalOf(session.user.kind));
  return NextResponse.json({ ok: true });
}
