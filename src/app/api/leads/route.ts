import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().max(254),
  kind: z.enum(["talent", "director"]),
  message: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { email, kind, message } = parsed.data;
  const { error } = await db().from("leads").insert({ email, kind, message: message ?? null });

  if (error) {
    // duplicate (email, kind) signups land here too
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
