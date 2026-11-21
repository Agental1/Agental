import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }));
const { captchaEnabled, captchaPassed } = await import("@/lib/abuse");

describe("CAPTCHA (Turnstile)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is off, and lets everything through, until both keys are set", async () => {
    expect(captchaEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(await captchaPassed(undefined)).toBe(true);
  });

  it("refuses a missing token and asks Cloudflare about a present one", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    expect(await captchaPassed("")).toBe(false);
    const fetch = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await captchaPassed("tok")).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockImplementationOnce(async () => Response.json({ success: false }));
    expect(await captchaPassed("tok")).toBe(false);
  });
});
