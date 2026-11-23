import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Round 9, group 8: text messages, behind a flag that stays off.
 *
 * On only when all of these are set: SMS_ENABLED=true, TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID (a Messaging Service
 * whose sender passed US carrier registration, 10DLC). Until then nothing is
 * sent and the inbound webhook answers 404. docs/HANDOFF.md lists what is
 * missing. Only the "roles found" text exists, for performers who chose Text
 * or Both, gave the consent and did not text STOP.
 */
type Env = Record<string, string | undefined>;

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
}

export function smsConfig(env: Env = process.env): SmsConfig | null {
  if ((env.SMS_ENABLED ?? "").trim() !== "true") return null;
  const accountSid = (env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = (env.TWILIO_AUTH_TOKEN ?? "").trim();
  const messagingServiceSid = (env.TWILIO_MESSAGING_SERVICE_SID ?? "").trim();
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || authToken.length < 16 || !/^MG[0-9a-f]{32}$/i.test(messagingServiceSid)) return null;
  return { accountSid, authToken, messagingServiceSid };
}

/** Keywords carriers and the CTIA expect (case-insensitive, the whole message). */
export const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"];
export const START_WORDS = ["START", "UNSTOP", "YES"];
export const HELP_WORDS = ["HELP", "INFO"];

export function keywordOf(body: string): "stop" | "start" | "help" | null {
  const w = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.includes(w)) return "stop";
  if (START_WORDS.includes(w)) return "start";
  if (HELP_WORDS.includes(w)) return "help";
  return null;
}

export const SMS_TEXT = {
  rolesFound: (count: number, link: string) =>
    `Agental: your AI agent found new roles for you (${count}). See them: ${link} Reply STOP to opt out, HELP for help.`,
  stop: "Agental: you are unsubscribed and will get no more texts. Reply START to subscribe again.",
  start: "Agental: you are subscribed again to role alerts. Up to 1 text a day. Msg & data rates may apply. Reply STOP to opt out.",
  help: "Agental role alerts: up to 1 text a day when your AI agent finds roles. Msg & data rates may apply. Help: contact@agental.co. Reply STOP to opt out.",
};

/**
 * Twilio's request signature: HMAC-SHA1 of the full URL followed by each POST
 * parameter name and value sorted by name, base64, with the auth token.
 */
export function twilioSignatureValid(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = Buffer.from(createHmac("sha1", authToken).update(data, "utf8").digest("base64"));
  const given = Buffer.from(signature ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function sendSms(
  to: string,
  body: string,
  meta: { userId?: string | null; kind: string },
  opts: { env?: Env; fetch?: typeof fetch } = {}
): Promise<{ ok: boolean; mode: "twilio" | "off" }> {
  const cfg = smsConfig(opts.env);
  if (!cfg) {
    await prisma.smsLog.create({ data: { userId: meta.userId ?? null, kind: meta.kind, status: "logged" } }).catch(() => {});
    return { ok: true, mode: "off" };
  }
  if (!/^\+1\d{10}$/.test(to)) return { ok: false, mode: "twilio" };
  const f = opts.fetch ?? fetch;
  try {
    const res = await f(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ MessagingServiceSid: cfg.messagingServiceSid, To: to, Body: body.slice(0, 320) }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    let sid: string | null = null;
    try {
      const j = (await res.json()) as { sid?: unknown };
      sid = typeof j.sid === "string" ? j.sid.slice(0, 64) : null;
    } catch {
      sid = null;
    }
    await prisma.smsLog.create({ data: { userId: meta.userId ?? null, kind: meta.kind, status: res.ok ? "sent" : "failed", providerId: sid } }).catch(() => {});
    return { ok: res.ok, mode: "twilio" };
  } catch {
    await prisma.smsLog.create({ data: { userId: meta.userId ?? null, kind: meta.kind, status: "failed" } }).catch(() => {});
    return { ok: false, mode: "twilio" };
  }
}

/** Record STOP or START for every profile with that number. */
export async function recordKeyword(fromE164: string, keyword: "stop" | "start" | "help", now = new Date()): Promise<void> {
  if (keyword === "stop") await prisma.artistProfile.updateMany({ where: { phoneE164: fromE164, smsOptOutAt: null }, data: { smsOptOutAt: now } });
  if (keyword === "start") await prisma.artistProfile.updateMany({ where: { phoneE164: fromE164, smsOptOutAt: { not: null } }, data: { smsOptOutAt: null } });
  await prisma.smsLog.create({ data: { kind: keyword, status: "received" } }).catch(() => {});
}
