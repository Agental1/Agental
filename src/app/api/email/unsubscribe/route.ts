import { applyUnsubscribe } from "@/lib/email-unsubscribe";

/**
 * POST /api/email/unsubscribe?u=&c=&t= : the one-click unsubscribe of the
 * automatic emails (RFC 8058, the List-Unsubscribe-Post header), which mail
 * apps call without opening a page. A GET changes nothing: a link scanner
 * that follows links must never unsubscribe anyone.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const ok = await applyUnsubscribe(q.get("u") ?? "", q.get("c") ?? "", q.get("t") ?? "");
  return new Response(ok ? "Unsubscribed" : "Invalid link", { status: ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
