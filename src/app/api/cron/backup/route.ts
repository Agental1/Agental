import { prisma } from "@/lib/db";
import { exportDatabase, storeBackup } from "@/lib/backup";
import { bearerMatches } from "@/lib/limelight/request";

/**
 * GET /api/cron/backup: the daily database backup (round 8c, src/lib/backup.ts).
 * Called by the Vercel cron in vercel.json, which sends
 * `Authorization: Bearer <CRON_SECRET>`. While CRON_SECRET is unset the route
 * does not exist (404); a wrong or missing token answers 401. The answer holds
 * the file name, its size and table counts, never any data.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "no-store" };
  if (!bearerMatches(req.headers, secret)) return Response.json({ ok: false }, { status: 401, headers });

  const now = new Date();
  try {
    const file = await exportDatabase(prisma as never, now);
    const stored = await storeBackup(file, now);
    const rows = Object.values(file.tables).reduce((n, t) => n + t.length, 0);
    console.info(`[backup] ${stored.path} ${stored.bytes} bytes, ${Object.keys(file.tables).length} tables, ${rows} rows, ${stored.removed} old removed`);
    return Response.json(
      { ok: true, path: stored.path, bytes: stored.bytes, tables: Object.keys(file.tables).length, rows, removed: stored.removed },
      { headers }
    );
  } catch (error) {
    console.error("[backup] failed:", error instanceof Error ? error.message.slice(0, 80) : "unknown error");
    return Response.json({ ok: false }, { status: 500, headers });
  }
}
