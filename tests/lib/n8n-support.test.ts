import { describe, expect, it, vi } from "vitest";
import { askN8nSupport, n8nSupportConfig } from "@/lib/n8n/support";

/** Messages answered by n8n only behind the staging flag, with the question alone sent. */
const env = {
  AGENTAL_FIND_STAGING: "1",
  N8N_SUPPORT_WEBHOOK_URL: "https://n8n.example/webhook/agental-pilot-support-v1",
  N8N_SHARED_SECRET: "a-shared-secret-long-enough-123",
};
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("n8n support answers", () => {
  it("stays off without the flag, an https URL or a long secret", () => {
    expect(n8nSupportConfig({ ...env, AGENTAL_FIND_STAGING: "" })).toBeNull();
    expect(n8nSupportConfig({ ...env, AGENTAL_FIND_STAGING: "true" })).toBeNull();
    expect(n8nSupportConfig({ ...env, N8N_SUPPORT_WEBHOOK_URL: "http://n8n.example/x" })).toBeNull();
    expect(n8nSupportConfig({ ...env, N8N_SHARED_SECRET: "short" })).toBeNull();
    expect(n8nSupportConfig(env)).not.toBeNull();
  });

  it("sends the question only, with the secret, and returns the answer", async () => {
    const f = reply({ requestId: "m1", assistant: "Samantha", kind: "answer", answer: "Use Forgot password? on the sign-in page.", links: [] });
    const out = await askN8nSupport({ requestId: "m1", question: "How do I reset my password?" }, { env, fetch: f as never });
    expect(out).toEqual({ text: "Use Forgot password? on the sign-in page.", handoff: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(env.N8N_SUPPORT_WEBHOOK_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${env.N8N_SHARED_SECRET}`);
    expect(JSON.parse(init.body as string)).toEqual({ requestId: "m1", assistant: "Samantha", question: "How do I reset my password?" });
  });

  it("reports a recommended handoff", async () => {
    const f = reply({ kind: "human_handoff", answer: "This needs a member of the Agental team to review the details." });
    expect(await askN8nSupport({ requestId: "m2", question: "My commission?" }, { env, fetch: f as never })).toMatchObject({ handoff: true });
  });

  it("falls back (null) on an error status, a bad shape or a network failure", async () => {
    expect(await askN8nSupport({ requestId: "m3", question: "q" }, { env, fetch: reply({}, 500) as never })).toBeNull();
    expect(await askN8nSupport({ requestId: "m3", question: "q" }, { env, fetch: reply({ kind: "maybe", answer: "x" }) as never })).toBeNull();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await askN8nSupport({ requestId: "m3", question: "q" }, { env, fetch: boom as never })).toBeNull();
    quiet.mockRestore();
    expect(await askN8nSupport({ requestId: "m3", question: "q" }, { env: {}, fetch: boom as never })).toBeNull();
    expect(boom).toHaveBeenCalledTimes(1);
  });
});
