import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkSignatureHeaders,
  signBody,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "@/lib/workflow/signature";
import {
  alertEmail,
  modelEnabled,
  pilotProfileIds,
  selectProfileIds,
  signingSecret,
} from "@/lib/workflow/config";

/**
 * The intake signature: a good one passes, and a wrong secret, an altered
 * body, a moved timestamp or a stale request does not.
 */

const secret = "test-signing-secret-not-a-real-one";
const now = new Date("2026-11-19T10:00:00Z");
const seconds = Math.floor(now.getTime() / 1000);
const body = JSON.stringify({ source: "fixture", briefs: [{ title: "Night Shift" }] });

function check(over: Partial<Parameters<typeof verifySignature>[0]> = {}) {
  const timestamp = String(seconds);
  return verifySignature({
    secret,
    timestamp,
    signature: signBody(secret, timestamp, body),
    rawBody: body,
    now,
    ...over,
  });
}

describe("signBody", () => {
  it("is the HMAC-SHA256 of '<timestamp>.<raw body>', in hex, with its prefix", () => {
    const expected = createHmac("sha256", secret).update(`${seconds}.${body}`).digest("hex");
    expect(signBody(secret, seconds, body)).toBe(`sha256=${expected}`);
    expect(signBody(secret, String(seconds), Buffer.from(body))).toBe(`sha256=${expected}`);
  });

  it("matches the worked example in docs/WORKFLOWS.md", () => {
    expect(
      signBody(
        "example-secret-do-not-use",
        "1794650400",
        '{"source":"manual","briefs":[{"title":"Night Shift"}]}'
      )
    ).toBe("sha256=0d3538f8a0ac723035075c7b5d052870ff0c94fe869be4ce325d0b2c737ee9e7");
  });

  it("names its headers", () => {
    expect(TIMESTAMP_HEADER).toBe("x-agental-timestamp");
    expect(SIGNATURE_HEADER).toBe("x-agental-signature");
  });
});

describe("verifySignature", () => {
  it("accepts a request signed with the secret", () => {
    expect(check()).toBe("ok");
    expect(check({ rawBody: Buffer.from(body) })).toBe("ok");
  });

  it("refuses another secret", () => {
    expect(check({ signature: signBody("another-secret", String(seconds), body) })).toBe("mismatch");
    expect(check({ secret: "another-secret" })).toBe("mismatch");
  });

  it("refuses a body that changed after signing", () => {
    expect(check({ rawBody: body.replace("Night", "Day") })).toBe("mismatch");
    expect(check({ rawBody: `${body} ` })).toBe("mismatch");
  });

  it("refuses a timestamp that was swapped for a fresher one", () => {
    const old = String(seconds - 60);
    expect(check({ signature: signBody(secret, old, body) })).toBe("mismatch");
  });

  it("refuses a request outside five minutes, in either direction", () => {
    const sign = (ts: number) => ({ timestamp: String(ts), signature: signBody(secret, ts, body) });
    expect(check(sign(seconds - 300))).toBe("ok");
    expect(check(sign(seconds + 300))).toBe("ok");
    expect(check(sign(seconds - 301))).toBe("stale");
    expect(check(sign(seconds + 301))).toBe("stale");
    expect(check(sign(0))).toBe("stale");
  });

  it("refuses missing headers", () => {
    expect(check({ timestamp: null })).toBe("missing");
    expect(check({ signature: null })).toBe("missing");
    expect(check({ timestamp: "", signature: "" })).toBe("missing");
  });

  it("refuses malformed headers", () => {
    const good = signBody(secret, String(seconds), body);
    expect(check({ timestamp: "yesterday" })).toBe("malformed");
    expect(check({ timestamp: `${seconds}.5` })).toBe("malformed");
    expect(check({ timestamp: `${seconds * 1000}000` })).toBe("malformed");
    expect(check({ signature: good.slice("sha256=".length) })).toBe("malformed");
    expect(check({ signature: good.slice(0, -2) })).toBe("malformed");
    expect(check({ signature: `sha1=${"a".repeat(64)}` })).toBe("malformed");
    expect(check({ signature: good.toUpperCase() })).toBe("malformed");
  });

  it("checks the headers alone the same way", () => {
    const good = signBody(secret, String(seconds), body);
    expect(checkSignatureHeaders(String(seconds), good, now)).toBe("ok");
    expect(checkSignatureHeaders(null, good, now)).toBe("missing");
    expect(checkSignatureHeaders(String(seconds - 1000), good, now)).toBe("stale");
    expect(checkSignatureHeaders(String(seconds - 1000), good, now, 2000)).toBe("ok");
  });
});

describe("workflow environment", () => {
  it("is off when nothing is set", () => {
    expect(signingSecret({})).toBeNull();
    expect(signingSecret({ WORKFLOW_SIGNING_SECRET: "   " })).toBeNull();
    expect(pilotProfileIds({})).toEqual([]);
    expect(modelEnabled({})).toBe(false);
    expect(alertEmail({})).toBeNull();
  });

  it("reads the secret, the pilot list and the model switch", () => {
    expect(signingSecret({ WORKFLOW_SIGNING_SECRET: ` ${secret} ` })).toBe(secret);
    expect(pilotProfileIds({ WORKFLOW_PILOT_PROFILE_IDS: " p1, p2 ,,p1, bad id ,p_3" })).toEqual([
      "p1",
      "p2",
      "p_3",
    ]);
    expect(modelEnabled({ WORKFLOW_MODEL_ENABLED: "true" })).toBe(true);
    expect(modelEnabled({ WORKFLOW_MODEL_ENABLED: "1" })).toBe(true);
    expect(modelEnabled({ WORKFLOW_MODEL_ENABLED: "yes please" })).toBe(false);
    expect(modelEnabled({ WORKFLOW_MODEL_ENABLED: "false" })).toBe(false);
  });

  it("lets a request narrow the pilot list and never widen it", () => {
    const pilot = ["p1", "p2", "p3"];
    expect(selectProfileIds(pilot)).toEqual(pilot);
    expect(selectProfileIds(pilot, ["p3", "p1", "outsider"])).toEqual(["p1", "p3"]);
    expect(selectProfileIds(pilot, ["outsider"])).toEqual([]);
    expect(selectProfileIds([], ["p1"])).toEqual([]);
  });
});
