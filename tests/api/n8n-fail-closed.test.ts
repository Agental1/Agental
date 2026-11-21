import { afterEach, describe, expect, it, vi } from "vitest";

// Every n8n route refuses before reading the body or the database while
// N8N_SHARED_SECRET is unset or too short (404), and on a wrong secret (401).
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: () => { throw new Error("database touched"); } }),
}));

import * as castingClaim from "@/app/api/n8n/casting/claim/route";
import * as castingComplete from "@/app/api/n8n/casting/complete/route";
import * as inboxClaim from "@/app/api/n8n/inbox/claim/route";
import * as inboxComplete from "@/app/api/n8n/inbox/complete/route";
import * as inboxReview from "@/app/api/n8n/inbox/review/route";

const ROUTES = { castingClaim, castingComplete, inboxClaim, inboxComplete, inboxReview };

function req(auth?: string) {
  return new Request("http://localhost/api/n8n/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify({ executionId: "e1", limit: 1, threadId: "t", messageId: "m" }),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("n8n routes fail closed", () => {
  for (const [name, route] of Object.entries(ROUTES)) {
    it(`${name}: 404 without a secret, 404 with a short one, 401 on a wrong one`, async () => {
      vi.stubEnv("N8N_SHARED_SECRET", "");
      expect((await route.POST(req())).status).toBe(404);
      expect((await route.POST(req("Bearer anything"))).status).toBe(404);
      vi.stubEnv("N8N_SHARED_SECRET", "short-secret");
      expect((await route.POST(req("Bearer short-secret"))).status).toBe(404);
      vi.stubEnv("N8N_SHARED_SECRET", "a".repeat(32));
      expect((await route.POST(req())).status).toBe(401);
      expect((await route.POST(req(`Bearer ${"b".repeat(32)}`))).status).toBe(401);
    });
  }
});
