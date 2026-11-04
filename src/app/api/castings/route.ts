import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await db()
    .from("castings")
    .select("id, title, category, city, status, pay_min, pay_max, deadline, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ castings: data ?? [] });
}
