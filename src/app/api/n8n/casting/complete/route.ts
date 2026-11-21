import { CompleteInput, completeCastingJobs, n8nAuth } from "@/lib/n8n/casting";

export const dynamic = "force-dynamic";

/**
 * POST /api/n8n/casting/complete, called by the n8n "Beta V2" workflow with
 * the claim's execution id and the ranked results. Idempotent per request:
 * a retry answers "already_recorded" and writes nothing. Results become
 * application drafts for the performer's review; nothing is submitted.
 */
export async function POST(req: Request) {
  const auth = n8nAuth(req.headers);
  const headers = { "Cache-Control": "no-store" };
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const body = CompleteInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    return Response.json(await completeCastingJobs(body.data), { headers });
  } catch (error) {
    console.error("[n8n] casting complete failed:", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
