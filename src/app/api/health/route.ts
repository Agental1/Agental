import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, db: hasSupabase, ts: Date.now() });
}
