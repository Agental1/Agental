import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESEND_ENDPOINT,
  SEND_TIMEOUT_MS,
  emailSenderConfigured,
  sendEmail,
} from "@/lib/mailer";

/**
 * The mailer with an injected environment and an injected fetch. The global
 * fetch is replaced by a function that fails the test, so a mistake here can
 * never reach the network.
 */

const LINK = "https://www.agental.test/en/verifier?token=s3cr3t-token-value";
const message = {
  to: "Ana.Ruiz@Example.com",
  subject: "Confirm your email address for Agental",
  text: `Confirm that this address is yours.\n\n${LINK}\n`,
  html: `<p><a href="${LINK}">Confirm my email</a></p>`,
};

const configured = {
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Agental <no-reply@agental.test>",
  NODE_ENV: "production",
};

const forbiddenFetch = vi.fn(async () => {
  throw new Error("the real fetch must stay unused in tests");
});
vi.stubGlobal("fetch", forbiddenFetch);

function spies() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

const logged = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => call.map(String).join(" ")).join("\n");

afterEach(() => {
  vi.restoreAllMocks();
  expect(forbiddenFetch).not.toHaveBeenCalled();
});

describe("emailSenderConfigured", () => {
  it("needs both the key and the sender", () => {
    expect(emailSenderConfigured(configured)).toBe(true);
    expect(emailSenderConfigured({ RESEND_API_KEY: "re_test_key" })).toBe(false);
    expect(emailSenderConfigured({ EMAIL_FROM: "a@agental.test" })).toBe(false);
    expect(emailSenderConfigured({})).toBe(false);
  });

  it("treats empty and blank values as missing", () => {
    expect(emailSenderConfigured({ RESEND_API_KEY: "", EMAIL_FROM: "a@agental.test" })).toBe(false);
    expect(emailSenderConfigured({ RESEND_API_KEY: "re_test_key", EMAIL_FROM: "   " })).toBe(false);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(emailSenderConfigured()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "a@agental.test");
    expect(emailSenderConfigured()).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("sendEmail in log mode", () => {
  it("answers ok without calling fetch when nothing is configured", async () => {
    const { info } = spies();
    const fetch = vi.fn();

    expect(await sendEmail(message, { env: { NODE_ENV: "production" }, fetch })).toEqual({
      ok: true,
      mode: "log",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("logs the subject and the recipient's domain only in production", async () => {
    const { info, error } = spies();

    await sendEmail(message, { env: { NODE_ENV: "production" }, fetch: vi.fn() });

    const line = logged(info);
    expect(line).toContain("Confirm your email address for Agental");
    expect(line).toContain("*@Example.com");
    // One line: the body, the address, the link and the token all stay out.
    expect(line).not.toContain("\n");
    expect(line).not.toMatch(/ana/i);
    expect(line).not.toContain("http");
    expect(line).not.toContain("s3cr3t-token-value");
    expect(line).not.toContain("Confirm that this address is yours");
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["development", "test", undefined])(
    "adds the text body when NODE_ENV is %s, so the link can be clicked",
    async (nodeEnv) => {
      const { info } = spies();

      await sendEmail(message, { env: { NODE_ENV: nodeEnv }, fetch: vi.fn() });

      expect(info).toHaveBeenCalledTimes(1);
      const line = logged(info);
      expect(line).toContain(LINK);
      expect(line).toContain("Confirm that this address is yours");
      // The body is the text version. The address and the HTML stay out.
      expect(line).not.toMatch(/ana\.ruiz/i);
      expect(line).not.toContain("<a ");
    }
  );

  it("stays in log mode when half of the configuration is missing", async () => {
    spies();
    const fetch = vi.fn();
    for (const env of [
      { RESEND_API_KEY: "re_test_key", NODE_ENV: "production" },
      { EMAIL_FROM: "a@agental.test", NODE_ENV: "production" },
    ]) {
      expect(await sendEmail(message, { env, fetch })).toEqual({ ok: true, mode: "log" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs a placeholder for a recipient with no domain", async () => {
    const { info } = spies();
    await sendEmail({ ...message, to: "not-an-address" }, { env: { NODE_ENV: "production" }, fetch: vi.fn() });
    expect(logged(info)).toContain("*@unknown");
    expect(logged(info)).not.toContain("not-an-address");
  });
});

describe("sendEmail through Resend", () => {
  const okFetch = () =>
    vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
      async () => new Response("{}", { status: 200 })
    );

  it("posts one request with the key, the sender and the message", async () => {
    const { info, error } = spies();
    const fetch = okFetch();

    expect(await sendEmail(message, { env: configured, fetch })).toEqual({
      ok: true,
      mode: "resend",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Agental <no-reply@agental.test>",
      to: "Ana.Ruiz@Example.com",
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    // A delivered email leaves the log empty.
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("gives the request an eight second timeout", async () => {
    spies();
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = okFetch();

    await sendEmail(message, { env: configured, fetch });

    expect(SEND_TIMEOUT_MS).toBe(8000);
    expect(timeout).toHaveBeenCalledWith(8000);
    expect(fetch.mock.calls[0][1]?.signal).toBe(signal);
  });

  it("trims the key and the sender", async () => {
    spies();
    const fetch = okFetch();
    await sendEmail(message, {
      env: { RESEND_API_KEY: " re_test_key\n", EMAIL_FROM: " a@agental.test " },
      fetch,
    });
    const init = fetch.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer re_test_key" });
    expect(JSON.parse(String(init?.body)).from).toBe("a@agental.test");
  });

  it.each([400, 401, 403, 422, 429, 500, 503])(
    "answers not ok on HTTP %i and logs the status only",
    async (status) => {
      const { error } = spies();
      // Resend repeats what it was sent in some error bodies.
      const body = JSON.stringify({ message: `Invalid to: ${message.to}`, link: LINK });
      const fetch = vi.fn(async () => new Response(body, { status }));

      expect(await sendEmail(message, { env: configured, fetch })).toEqual({ ok: false });

      expect(error).toHaveBeenCalledTimes(1);
      const line = logged(error);
      expect(line).toContain(String(status));
      expect(line).not.toMatch(/ana/i);
      expect(line).not.toContain("example.com");
      expect(line).not.toContain("http");
      expect(line).not.toContain("re_test_key");
    }
  );

  it("answers not ok when fetch throws, and logs the error name only", async () => {
    const { error } = spies();
    const fetch = vi.fn(async () => {
      throw new TypeError(`fetch failed for ${message.to} with Bearer re_test_key`);
    });

    expect(await sendEmail(message, { env: configured, fetch })).toEqual({ ok: false });

    const line = logged(error);
    expect(line).toContain("TypeError");
    expect(line).not.toMatch(/ana/i);
    expect(line).not.toContain("re_test_key");
  });

  it("answers not ok on a timeout", async () => {
    const { error } = spies();
    const fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });

    expect(await sendEmail(message, { env: configured, fetch })).toEqual({ ok: false });
    expect(logged(error)).toContain("TimeoutError");
  });

  it("answers not ok when something that is not an Error is thrown", async () => {
    const { error } = spies();
    const fetch = vi.fn(async () => {
      throw message.to;
    });

    expect(await sendEmail(message, { env: configured, fetch })).toEqual({ ok: false });
    expect(logged(error)).not.toMatch(/ana/i);
  });

  it("keeps production logs free of the address and the link in every outcome", async () => {
    const { info, error } = spies();
    await sendEmail(message, { env: configured, fetch: okFetch() });
    await sendEmail(message, { env: configured, fetch: vi.fn(async () => new Response("", { status: 500 })) });
    await sendEmail(message, { env: { NODE_ENV: "production" }, fetch: vi.fn() });

    const everything = `${logged(info)}\n${logged(error)}`;
    expect(everything).not.toMatch(/ana\.ruiz/i);
    expect(everything).not.toContain(LINK);
    expect(everything).not.toContain("s3cr3t-token-value");
    // Guards the guard: something was logged.
    expect(everything).toContain("[mailer]");
  });
});
