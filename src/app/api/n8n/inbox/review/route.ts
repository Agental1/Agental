import { n8nAuth } from "@/lib/n8n/casting";
import { InboxReviewInput, queueInboxReview } from "@/lib/n8n/inbox";

export const dynamic = "force-dynamic";

/** POST /api/n8n/inbox/review for the Direct Replies workflow. Bearer secret; 404 when unset. */
export async function POST(req: Request) {
  const auth = n8nAuth(req.headers);
  const headers = { "Cache-Control": "no-store" };
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const body = InboxReviewInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    return Response.json(await queueInboxReview(body.data), { headers });
  } catch (error) {
    console.error("[n8n] inbox review failed:", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
