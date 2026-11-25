import { ClaimInput, claimCastingJobs, n8nAuth, queueScheduledSearches, searchCostCeilingUsd } from "@/lib/n8n/casting";
import { workflowMode } from "@/domain/workflow/eligibility";
import { isPaused, searchesRunning } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/n8n/casting/claim, called by the n8n "Beta V2" workflow with
 * `Authorization: Bearer <N8N_SHARED_SECRET>`. Off (404) without the secret.
 * Queues the six-hour searches that are due, then claims queued searches.
 * Hands out nothing while paused or while "Run searches" is off.
 * The answer holds request ids and the minimum profile fields, nothing else.
 */
export async function POST(req: Request) {
  const auth = n8nAuth(req.headers);
  const headers = { "Cache-Control": "no-store" };
  if (auth === "off") return new Response("Not found", { status: 404 });
  if (auth === "denied") return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const body = ClaimInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    const now = new Date();
    const mode = workflowMode();
    // Round 9: the pause switch (Admin > Controls). Searches wait in the queue.
    if (await isPaused()) return Response.json({ jobs: [], scheduled: 0, canceled: 0, mode, paused: true, limits: { costCeilingUsd: searchCostCeilingUsd() } }, { headers });
    // Round 11.1: "Run searches" (Admin > Controls, off by default). While off,
    // every search stays queued: an empty claim, nothing reaches n8n, no cost.
    if (!(await searchesRunning())) return Response.json({ jobs: [], scheduled: 0, canceled: 0, mode, running: false, limits: { costCeilingUsd: searchCostCeilingUsd() } }, { headers });
    const scheduled = await queueScheduledSearches(now, mode);
    const { jobs, canceled } = await claimCastingJobs(body.data, { now, mode });
    // Round 9: the per-search cost ceiling the workflow must stop at.
    return Response.json({ jobs, scheduled, canceled, mode, limits: { costCeilingUsd: searchCostCeilingUsd() } }, { headers });
  } catch (error) {
    console.error("[n8n] casting claim failed:", error instanceof Error ? error.name : "Error");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
