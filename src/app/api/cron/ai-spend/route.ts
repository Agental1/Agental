import { bearerMatches } from "@/lib/limelight/request";
import { aiAccountStates, sendSpendAlerts } from "@/lib/ai-spend";
import { purgeDeletedAccounts } from "@/lib/admin/account-removal";
import { drainOutbox } from "@/lib/limelight/outbox";
import { drainConfirmations } from "@/lib/limelight/confirmation";
import { runAutoEmails } from "@/lib/auto-emails";

/**
 * GET /api/cron/ai-spend (round 8d): reads each AI provider's spend and sends
 * the alerts due (low balance, 80% of a monthly budget) once, even when nobody
 * opens the admin. Called by the Vercel cron in vercel.json with
 * `Authorization: Bearer <CRON_SECRET>`; 404 while CRON_SECRET is unset. The
 * answer holds counts only.
 *
 * Round 9: the same daily run purges the accounts deleted more than 30 days
 * ago (Vercel Hobby allows a few daily crons; this one carries the daily
 * housekeeping). Opening Admin > Deleted purges too.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "no-store" };
  if (!bearerMatches(req.headers, secret)) return Response.json({ ok: false }, { status: 401, headers });
  const states = await aiAccountStates();
  const sent = await sendSpendAlerts(states);
  const purge = await purgeDeletedAccounts().catch((e) => {
    console.error("[cron] purge failed", e instanceof Error ? e.name : "error");
    return { purged: 0, failed: -1 };
  });
  // Round 9: retries of the Limelight team alert and confirmation, daily.
  const limelight = await Promise.all([drainOutbox({ limit: 25 }), drainConfirmations({ limit: 25 })]).catch((e) => {
    console.error("[cron] limelight drain failed", e instanceof Error ? e.name : "error");
    return null;
  });
  // Round 9, group 6: the automatic emails also run once a day from here (the hourly
  // run is the GitHub Actions schedule, Vercel Hobby allowing daily crons only).
  const auto = await runAutoEmails().catch((e) => {
    console.error("[cron] automatic emails failed", e instanceof Error ? e.name : "error");
    return null;
  });
  return Response.json(
    { ok: true, autoEmails: auto, alerts: sent.length, purged: purge.purged, purgeFailed: purge.failed, limelightAlerts: limelight?.[0].sent ?? null, confirmations: limelight?.[1].sent ?? null },
    { headers }
  );
}
