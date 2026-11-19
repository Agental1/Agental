import { drainOutbox } from "@/lib/limelight/outbox";
import { bearerMatches } from "@/lib/limelight/request";

/**
 * GET or POST /api/limelight/outbox/drain: deliver the alerts that are due.
 *
 * For a scheduler. The caller sends `Authorization: Bearer <CRON_SECRET>`.
 * While CRON_SECRET is unset the route does not exist (404); with a wrong or
 * missing token it answers 401. The answer holds counts and nothing else.
 *
 * GET is accepted because schedulers that only issue GET exist. The route
 * changes state on GET, which is safe here: it requires the secret, and a
 * second call does nothing the first did not.
 */

async function drain(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });

  const headers = { "Cache-Control": "no-store" };
  if (!bearerMatches(req.headers, secret)) {
    return Response.json({ ok: false }, { status: 401, headers });
  }

  try {
    const result = await drainOutbox({ limit: 25 });
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    console.error(
      "[limelight] outbox drain failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return Response.json({ ok: false }, { status: 500, headers });
  }
}

export async function GET(req: Request) {
  return drain(req);
}

export async function POST(req: Request) {
  return drain(req);
}
