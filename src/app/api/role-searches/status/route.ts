import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMySearchStatus } from "@/lib/role-search";

/**
 * The dashboard's Status block (round 8b): the signed-in performer's searches
 * in queue, running and finished, and the roles found. The block asks every
 * 30 seconds while the tab is visible.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = await getMySearchStatus(session.user.id);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
