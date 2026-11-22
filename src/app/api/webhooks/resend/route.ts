import { prisma } from "@/lib/db";
import { RESEND_EVENT_STATUS, verifySvix } from "@/domain/svix";

export const dynamic = "force-dynamic";

/**
 * Resend delivery events (sent, delivered, delayed, bounced, complained,
 * failed) update the admin email log. Signed with Svix; RESEND_WEBHOOK_SECRET
 * comes from Resend > Webhooks. Without it the route answers 404, and a bad
 * signature 401. Only the email id and the event type are read.
 */
export async function POST(req: Request) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return new Response("Not found", { status: 404 });
  const body = await req.text();
  if (body.length > 64_000) return new Response("Too large", { status: 413 });
  const ok = verifySvix(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    body
  );
  if (!ok) return new Response("Unauthorized", { status: 401 });
  let event: { type?: unknown; data?: { email_id?: unknown } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const status = typeof event.type === "string" ? RESEND_EVENT_STATUS[event.type] : undefined;
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id.slice(0, 100) : null;
  if (status && emailId) {
    // "sent" never overwrites a later state that arrived first.
    await prisma.emailLog.updateMany({
      where: { resendId: emailId, ...(status === "sent" ? { status: { in: ["queued", "sent"] } } : {}) },
      data: { status, lastEventAt: new Date() },
    });
  }
  return Response.json({ received: true });
}
