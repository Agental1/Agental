import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendEmail, type EmailRecorder } from "@/lib/mailer";

/** The admin email log: the mailer records each email, Resend's webhook updates it. */
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const P = "test-emaillog-";

describe("mailer recording", () => {
  it("records the outcome and the Resend id, never the body", async () => {
    const calls: unknown[] = [];
    const record: EmailRecorder = { start: async (m) => (calls.push(["start", m.kind, m.to]), "log1"), finish: async (id, o) => void calls.push(["finish", id, o]) };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    const env = { RESEND_API_KEY: "k", EMAIL_FROM: "a@agental.co" };
    expect(await sendEmail({ to: "x@y.z", subject: "S", text: "secret body", html: "", kind: "verify" }, { env, fetch, record })).toEqual({ ok: true, mode: "resend" });
    expect(calls).toEqual([["start", "verify", "x@y.z"], ["finish", "log1", { status: "sent", resendId: "re_123" }]]);
    calls.length = 0;
    await sendEmail({ to: "x@y.z", subject: "S", text: "t", html: "" }, { env: {}, record });
    expect(calls[1]).toEqual(["finish", "log1", { status: "logged" }]);
  });
});

describe.skipIf(!local)("Resend webhook", () => {
  const key = Buffer.from("webhook-test-key");
  afterAll(async () => {
    await prisma.emailLog.deleteMany({ where: { to: { startsWith: P } } });
    vi.unstubAllEnvs();
  });
  it("is off without the secret, refuses a bad signature, and updates the log", async () => {
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const row = await prisma.emailLog.create({ data: { to: `${P}a@test.local`, subject: "S", status: "sent", resendId: `${P}re1` } });
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: `${P}re1` } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v1,${createHmac("sha256", key).update(`m1.${ts}.${body}`).digest("base64")}`;
    const req = (signature: string) => new Request("http://x/api/webhooks/resend", { method: "POST", body, headers: { "svix-id": "m1", "svix-timestamp": ts, "svix-signature": signature } });
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect((await POST(req(sig))).status).toBe(404);
    vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`);
    expect((await POST(req("v1,AAAA"))).status).toBe(401);
    expect((await POST(req(sig))).status).toBe(200);
    expect((await prisma.emailLog.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("delivered");
  });
});
