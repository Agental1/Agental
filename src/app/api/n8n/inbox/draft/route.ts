import { n8nAuth } from "@/lib/n8n/casting";
import { InboxDraftInput, recordDraft } from "@/lib/reply-drafts";

export const dynamic = "force-dynamic";

/**
 * POST /api/n8n/inbox/draft (round 9, group 7): the Direct Replies workflow
 * posts its draft and the original email; a staff member approves it in
 * Admin > Replies to approve. Nothing is sent here. Bearer secret; 404 when
 * unset. Answers { status: "awaiting_approval" } once stored.
 */
export async function POST(req: Request) {
  const auth = n8nAuth(req.headers);
  const headers = { "Cache-Control": "no-store" };
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const body = InboxDraftInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    const res = await recordDraft(body.data);
    if (!res.recorded) return Response.json({ error: res.reason }, { status: 409, headers });
    return Response.json(res, { headers });
  } catch (error) {
    console.error("[n8n] inbox draft failed:", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
