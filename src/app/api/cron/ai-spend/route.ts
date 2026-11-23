import { bearerMatches } from "@/lib/limelight/request";
import { aiAccountStates, sendSpendAlerts } from "@/lib/ai-spend";

/**
 * GET /api/cron/ai-spend (round 8d): reads each AI provider's spend and sends
 * the alerts due (low balance, 80% of a monthly budget) once, even when nobody
 * opens the admin. Called by the Vercel cron in vercel.json with
 * `Authorization: Bearer <CRON_SECRET>`; 404 while CRON_SECRET is unset. The
 * answer holds counts only.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "no-store" };
  if (!bearerMatches(req.headers, secret)) return Response.json({ ok: false }, { status: 401, headers });
  const states = await aiAccountStates();
  const sent = await sendSpendAlerts(states);
  return Response.json({ ok: true, alerts: sent.length }, { headers });
}
