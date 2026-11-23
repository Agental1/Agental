import { SMS_TEXT, keywordOf, recordKeyword, smsConfig, twilioSignatureValid } from "@/lib/sms";

/**
 * POST /api/sms/inbound (round 9, group 8): texts sent to Agental's number,
 * forwarded by Twilio. STOP and its synonyms record the opt-out, START
 * removes it, HELP answers with how to reach the team; anything else gets no
 * answer. 404 while texts are off (SMS_ENABLED and the Twilio settings).
 * Every request must carry a valid X-Twilio-Signature.
 */
export const dynamic = "force-dynamic";

const twiml = (message: string | null) =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message>` : ""}</Response>`,
    { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } }
  );

export async function POST(req: Request) {
  const cfg = smsConfig();
  if (!cfg) return new Response("Not found", { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Bad request", { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  // The URL Twilio called, as configured on the number (public host, not the internal one).
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.agental.co").replace(/\/$/, "");
  const url = `${base}/api/sms/inbound`;
  if (!twilioSignatureValid(url, params, req.headers.get("x-twilio-signature") ?? "", cfg.authToken)) {
    return new Response("Forbidden", { status: 403 });
  }
  const from = (params.From ?? "").trim();
  const kw = keywordOf(params.Body ?? "");
  if (!kw || !/^\+\d{8,15}$/.test(from)) return twiml(null);
  await recordKeyword(from, kw);
  return twiml(kw === "stop" ? SMS_TEXT.stop : kw === "start" ? SMS_TEXT.start : SMS_TEXT.help);
}
