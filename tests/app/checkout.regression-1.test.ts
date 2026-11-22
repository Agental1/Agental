// Regression: ISSUE-001 — a failure inside the USC code action took the whole Subscription page down
// Found by /qa on 2026-11-22
// Report: .gstack/qa-reports/run-20261122T230421Z/qa-report-localhost-2026-11-22.md
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1", kind: "TALENT" } }) }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/promo-verification", () => ({
  sendUscCode: async () => {
    throw new Error("database unreachable");
  },
  verifyUscCode: async () => {
    throw new Error("database unreachable");
  },
}));

const { sendUscCodeAction, verifyUscCodeAction } = await import("@/app/actions/checkout");

describe("USC code actions answer a message instead of throwing", () => {
  it("send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendUscCodeAction("a@usc.edu")).toEqual({ ok: false, error: { key: "errors.codeUnavailable" } });
  });
  it("verify", async () => {
    expect(await verifyUscCodeAction("123456")).toEqual({ ok: false, error: { key: "errors.codeUnavailable" } });
  });
});
