import { n8nAuth } from "@/lib/n8n/casting";
import { InboxClaimInput, claimInboxReply } from "@/lib/n8n/inbox";

import { isPaused } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

/** POST /api/n8n/inbox/claim for the Direct Replies workflow. Bearer secret; 404 when unset. */
export async function POST(req: Request) {
  const auth = n8nAuth(req.headers);
  const headers = { "Cache-Control": "no-store" };
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers });
  // Round 9: the pause switch. The email stays in Gmail for the team to answer by hand
  // (it is not drafted after Resume).
  if (await isPaused()) return Response.json({ error: "paused" }, { status: 503, headers });
  const body = InboxClaimInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    return Response.json(await claimInboxReply(body.data), { headers });
  } catch (error) {
    console.error("[n8n] inbox claim failed:", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
