import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { replaceableBy, verifySvix } from "@/domain/svix";

const key = Buffer.from("a-test-signing-key-of-some-length");
const secret = `whsec_${key.toString("base64")}`;
const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;

describe("Svix signature", () => {
  const now = 1_800_000_000;
  const body = '{"type":"email.delivered","data":{"email_id":"e1"}}';
  it("accepts a valid, fresh signature, among others", () => {
    const sig = sign("m1", String(now), body);
    expect(verifySvix(secret, { id: "m1", timestamp: String(now), signature: `v1,bm9wZQ== ${sig}` }, body, now)).toBe(true);
  });
  it("refuses a changed body, an old timestamp, a missing header or a wrong secret", () => {
    const sig = sign("m1", String(now), body);
    expect(verifySvix(secret, { id: "m1", timestamp: String(now), signature: sig }, body + " ", now)).toBe(false);
    expect(verifySvix(secret, { id: "m1", timestamp: String(now - 600), signature: sign("m1", String(now - 600), body) }, body, now)).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(verifySvix(`whsec_${Buffer.from("other").toString("base64")}`, { id: "m1", timestamp: String(now), signature: sig }, body, now)).toBe(false);
  });
});

describe("email log status", () => {
  it("only moves forward", () => {
    expect(replaceableBy("delivered")).toEqual(expect.arrayContaining(["queued", "sent", "delayed"]));
    expect(replaceableBy("delivered")).not.toContain("bounced");
    expect(replaceableBy("delayed")).not.toContain("delivered");
    expect(replaceableBy("sent")).not.toContain("delivered");
    expect(replaceableBy("bounced")).toContain("delivered");
  });
});
