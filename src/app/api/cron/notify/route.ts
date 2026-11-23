import { bearerMatches } from "@/lib/limelight/request";
import { runAutoEmails } from "@/lib/auto-emails";

/**
 * GET /api/cron/notify (round 9, group 6): sends the automatic emails due
 * (roles found digest, application updates, replies unread for an hour,
 * welcome). Called every hour by the GitHub Actions schedule
 * (docs/ops/hourly-notify.yml, to be placed in .github/workflows) and once a day by the Vercel cron
 * (/api/cron/ai-spend), with `Authorization: Bearer <CRON_SECRET>`; 404 while
 * CRON_SECRET is unset. The answer holds counts only.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "no-store" };
  if (!bearerMatches(req.headers, secret)) return Response.json({ ok: false }, { status: 401, headers });
  try {
    return Response.json({ ok: true, ...(await runAutoEmails()) }, { headers });
  } catch (error) {
    console.error("[cron] automatic emails failed", error instanceof Error ? error.name : "error");
    return Response.json({ ok: false }, { status: 500, headers });
  }
}
