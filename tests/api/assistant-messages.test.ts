import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { FORBIDDEN_CONTEXT_KEYS } from "@/domain/assistant";

/**
 * The assistant in Messages against the real database, model off: topic
 * required, an answer per message, private data never in the context, and
 * the handoff to the team inbox.
 */
const P = "test-assistant-";
const session = vi.fn();
vi.mock("@/auth", () => ({ auth: session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendEmail: vi.fn(async () => ({ ok: true, mode: "log" })) }));
// Round 9: the key alone turns the model on; this file runs with it off.
process.env.ASSISTANT_MODEL_ENABLED = "false";

const { sendMessage, replyAsTeam } = await import("@/app/actions/messages");
const { getMyThread, listTeamThreads } = await import("@/lib/messages");
const { buildAssistantContext } = await import("@/lib/assistant/context");

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const key = (n: number) => `${P}k${String(n).padStart(8, "0")}`;
let perf: string;
let admin: string;

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe.skipIf(!local)("assistant in Messages", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${P}perf@test.local`, name: "Perf", kind: "TALENT" } });
    perf = u.id;
    admin = (await prisma.user.create({ data: { email: `${P}admin@test.local`, name: "Ad", kind: "TALENT", isAdmin: true } })).id;
    await prisma.artistProfile.create({
      data: {
        userId: perf,
        stageName: "Maya Test",
        phone: "+1 555 0100",
        city: "Los Angeles",
        preferences: JSON.stringify({ v: 2, contentBoundaries: { nudity: false }, projectTypes: ["FEATURE"] }),
      },
    });
  });
  afterAll(async () => {
    const ids = [perf, admin];
    await prisma.rateLimitEvent.deleteMany({ where: { key: { in: ids.map((id) => `msg:${id}`) } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("asks what the message is about first", async () => {
    session.mockResolvedValue({ user: { id: perf, kind: "TALENT" } });
    expect(await sendMessage({ body: "Hello", clientKey: key(1) })).toEqual({
      ok: false,
      error: { key: "errors.messageTopicRequired" },
    });
  });

  it("answers a profile question from the profile, and the thread is not waiting", async () => {
    session.mockResolvedValue({ user: { id: perf, kind: "TALENT" } });
    const res = await sendMessage({ body: "What is missing on my profile?", clientKey: key(2), topic: "profile", locale: "en" });
    expect(res.ok).toBe(true);
    const t = await getMyThread(perf);
    const answer = t.messages.at(-1)!;
    expect(answer.fromAgent).toBe(true);
    expect(answer.body).toMatch(/complete/);
    expect(t.waitingForTeam).toBe(false);
  });

  it("hands off what it cannot answer, and a team reply clears the status", async () => {
    session.mockResolvedValue({ user: { id: perf, kind: "TALENT" } });
    await sendMessage({ body: "Can you negotiate my fee for a commercial?", clientKey: key(3), topic: "other", locale: "en" });
    let t = await getMyThread(perf);
    expect(t.waitingForTeam).toBe(true);
    expect(t.messages.at(-1)!.body).toContain("Agental team");

    session.mockResolvedValue({ user: { id: admin, kind: "TALENT" } });
    const row = (await listTeamThreads(admin)).find((r) => r.threadId === t.threadId)!;
    expect(row.waitingForTeam).toBe(true);
    expect(await replyAsTeam(t.threadId!, { body: "We'll call you.", clientKey: key(4) })).toMatchObject({ ok: true });
    t = await getMyThread(perf);
    expect(t.waitingForTeam).toBe(false);
  });

  it("never puts contact details, content boundaries or media links in the context", async () => {
    for (const topic of ["profile", "application", "other"] as const) {
      const ctx = await buildAssistantContext(perf, topic, "en");
      const keys = keysOf(ctx);
      for (const forbidden of FORBIDDEN_CONTEXT_KEYS) expect(keys.has(forbidden)).toBe(false);
      const json = JSON.stringify(ctx);
      expect(json).not.toContain("555 0100");
      expect(json).not.toContain("test.local");
      expect(json).not.toContain("Los Angeles");
    }
  });
});
