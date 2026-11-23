import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { keywordOf, smsConfig, twilioSignatureValid } from "@/lib/sms";

/**
 * Round 9, group 8: texts stay off without SMS_ENABLED and the Twilio
 * settings; STOP, START and HELP are understood; the inbound webhook checks
 * Twilio's signature and records the opt-out; the "roles found" text respects
 * consent, STOP and the daily limit.
 */
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const ON = { SMS_ENABLED: "true", TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "test-auth-token-0123456789", TWILIO_MESSAGING_SERVICE_SID: "MG" + "b".repeat(32) };

describe("text messages: switches and keywords", () => {
  it("is off unless the flag and every setting are there", () => {
    expect(smsConfig({})).toBeNull();
    expect(smsConfig({ ...ON, SMS_ENABLED: "" })).toBeNull();
    expect(smsConfig({ ...ON, TWILIO_MESSAGING_SERVICE_SID: "" })).toBeNull();
    expect(smsConfig(ON)).not.toBeNull();
  });
  it("understands STOP, START and HELP and their synonyms, nothing else", () => {
    for (const w of ["STOP", "stop", " Unsubscribe ", "cancel", "END", "quit", "StopAll"]) expect(keywordOf(w)).toBe("stop");
    for (const w of ["START", "unstop", "yes"]) expect(keywordOf(w)).toBe("start");
    for (const w of ["HELP", "info"]) expect(keywordOf(w)).toBe("help");
    for (const w of ["please stop sending", "hello", ""]) expect(keywordOf(w)).toBeNull();
  });
  it("checks Twilio's signature (the example from Twilio's documentation)", () => {
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignatureValid("https://mycompany.com/myapp.php?foo=1&bar=2", params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", "12345")).toBe(true);
    expect(twilioSignatureValid("https://mycompany.com/myapp.php?foo=1&bar=2", { ...params, Digits: "9" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", "12345")).toBe(false);
  });
});

describe.skipIf(!local)("text messages: webhook and the roles found text", () => {
  const P = "test-r9sms-";
  const ids: Record<string, string> = {};
  const sent: { url: string; body: string }[] = [];
  beforeAll(async () => {
    for (const [k, v] of Object.entries(ON)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.agental.co");
    vi.stubEnv("WORKFLOW_MODE", "");
    for (const [n, channel, consent, phone] of [["ok", "both", true, "+15005550001"], ["noconsent", "sms", false, "+15005550002"], ["email", "email", true, "+15005550003"]] as const) {
      const u = await prisma.user.create({ data: { email: `${P}${n}@test.local`, accountStatus: "TEST", kind: "TALENT", welcomeEmailAt: new Date() } });
      ids[n] = u.id;
      await prisma.artistProfile.create({ data: { userId: u.id, stageName: `Sms ${n}`, roleAlertChannel: channel, smsConsentAt: consent ? new Date() : null, phoneE164: phone } });
      await prisma.notification.create({ data: { userId: u.id, kind: "ROLE_FOUND", payload: '{"role":"Lead"}', emailedAt: new Date() } });
    }
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("texts once a day only the performer who chose text, consented and did not STOP", async () => {
    const fakeFetch = (async (url: string, init: { body: string }) => {
      sent.push({ url, body: init.body });
      return new Response(JSON.stringify({ sid: "SM" + "c".repeat(32) }), { status: 201 });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fakeFetch);
    const { runAutoEmails } = await import("@/lib/auto-emails");
    const env = { ...ON, NEXT_PUBLIC_SITE_URL: "https://www.agental.co", RESEND_API_KEY: "x", EMAIL_FROM: "x" };
    const r = await runAutoEmails({ env, approved: new Set(["roles_found"] as const) });
    expect(r.roles_text).toBe(1);
    const texts = sent.filter((s) => s.url.includes("api.twilio.com"));
    expect(texts).toHaveLength(1);
    expect(decodeURIComponent(texts[0].body)).toContain("To=+15005550001");
    expect(decodeURIComponent(texts[0].body.replace(/\+/g, " "))).toContain("Reply STOP to opt out");
    expect((await runAutoEmails({ env, approved: new Set(["roles_found"] as const) })).roles_text).toBe(0);
    vi.unstubAllGlobals();
  });

  it("records STOP from a signed webhook, and refuses an unsigned one", async () => {
    const route = await import("@/app/api/sms/inbound/route");
    const params = { From: "+15005550001", Body: "STOP" };
    const { createHmac } = await import("node:crypto");
    const data = "https://www.agental.co/api/sms/inbound" + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
    const sig = createHmac("sha1", ON.TWILIO_AUTH_TOKEN).update(data).digest("base64");
    const call = (s: string) => route.POST(new Request("http://internal/api/sms/inbound", { method: "POST", headers: { "x-twilio-signature": s, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() }));
    expect((await call("forged")).status).toBe(403);
    const ok = await call(sig);
    expect(await ok.text()).toContain("you are unsubscribed");
    expect((await prisma.artistProfile.findUniqueOrThrow({ where: { userId: ids.ok } })).smsOptOutAt).not.toBeNull();
  });
});
