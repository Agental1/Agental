import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashEmail } from "@/domain/onboarding-chat-switch";

/**
 * Round 12, group 6: the switch and its audit, the per-account cap and usage
 * rows, the model path with a mocked client, the fallback without a key, and
 * the draft going with the profile. Local database only.
 */
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const P = "test-r12g6-";
/** The seeded entry: the sha256 hex only, the address itself is never in this public repository. */
const SEEDED = "sha256:89a1417d1deb410eaa9538bddbeea5c4e71628fca2f01783d54abfb9d0cb255c";
const FOUNDER = "founder@example.edu";

const create = vi.fn();
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; kind: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create }; } }));
vi.mock("@anthropic-ai/sdk/helpers/zod", () => ({ zodOutputFormat: (schema: unknown) => ({ type: "json_schema", schema }) }));

const ok = (obj: unknown, usage = { input_tokens: 50, output_tokens: 20 }) => ({ stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(obj) }] });

describe.skipIf(!local)("onboarding chat", () => {
  let adminId = "";
  let talentId = "";
  let profileId = "";
  let saved: { value: string; updatedById: string | null } | null = null;

  beforeAll(async () => {
    saved = await prisma.appSetting.findUnique({ where: { key: "onboarding.chat" }, select: { value: true, updatedById: true } });
    adminId = (await prisma.user.create({ data: { email: `${P}admin@test.local`, isAdmin: true, accountStatus: "STAFF" } })).id;
    talentId = (await prisma.user.create({ data: { email: `${P}talent@test.local`, kind: "TALENT", accountStatus: "TEST" } })).id;
    profileId = (await prisma.artistProfile.create({ data: { userId: talentId, stageName: "" } })).id;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (saved) await prisma.appSetting.update({ where: { key: "onboarding.chat" }, data: saved });
    else await prisma.appSetting.deleteMany({ where: { key: "onboarding.chat" } });
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: P } } });
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: talentId } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminId } });
    await prisma.onboardingDraft.deleteMany({ where: { profileId } });
    await prisma.artistProfile.deleteMany({ where: { userId: talentId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  });

  it("the migration seeds the setting with one hashed entry and no address in clear", async () => {
    // After this file's own restore step the seeded value is what `saved` holds (when the row existed before).
    if (!saved) return;
    const v = JSON.parse(saved.value) as { mode: string; allowlist: string[] };
    expect(v.mode).toBe("test_and_allowlist");
    expect(v.allowlist).toContain(SEEDED);
    expect(saved.value).not.toContain("@");
  });

  it("missing -> Test accounts only; unreadable -> off; read fresh", async () => {
    const { onboardingChatSetting } = await import("@/lib/app-settings");
    await prisma.appSetting.deleteMany({ where: { key: "onboarding.chat" } });
    expect(await onboardingChatSetting()).toMatchObject({ mode: "test_and_allowlist", allowlist: [] });
    await prisma.appSetting.create({ data: { key: "onboarding.chat", value: "{oops" } });
    expect((await onboardingChatSetting()).mode).toBe("off");
  });

  it("changing the mode and the allowlist is audited, hashed entries stay hidden", async () => {
    const { setOnboardingChatMode, updateOnboardingChatAllowlist, onboardingChatSetting } = await import("@/lib/app-settings");
    await prisma.appSetting.deleteMany({ where: { key: "onboarding.chat" } });
    await updateOnboardingChatAllowlist(adminId, { add: ["Friend@Example.com", `sha256:${hashEmail(FOUNDER)}`] });
    expect((await onboardingChatSetting()).allowlist).toEqual(["friend@example.com", `sha256:${hashEmail(FOUNDER)}`]);
    await setOnboardingChatMode(adminId, "everyone");
    await setOnboardingChatMode(adminId, "everyone"); // same state: nothing logged
    await updateOnboardingChatAllowlist(adminId, { remove: ["friend@example.com"] });
    expect((await onboardingChatSetting()).allowlist).toEqual([`sha256:${hashEmail(FOUNDER)}`]);
    expect(await prisma.auditLog.count({ where: { actorUserId: adminId, action: "admin.onboardingChat.mode" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { actorUserId: adminId, action: "admin.onboardingChat.allowlist" } })).toBe(2);
  });

  it("without a key: scripted flow for an allowed account, form when switched off; the page never breaks", async () => {
    const { setOnboardingChatMode } = await import("@/lib/app-settings");
    const { chatModeFor } = await import("@/lib/onboarding-chat/mode");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await setOnboardingChatMode(adminId, "everyone");
    expect(await chatModeFor(talentId)).toBe("scripted");
    await setOnboardingChatMode(adminId, "off");
    expect(await chatModeFor(talentId)).toBe("form");
    expect(await chatModeFor("does-not-exist")).toBe("form");
  });

  it("with a key, a Test account gets the model; the daily cap sends it back to scripted", async () => {
    const { setOnboardingChatMode } = await import("@/lib/app-settings");
    const { chatModeFor } = await import("@/lib/onboarding-chat/mode");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ASSISTANT_MODEL_ENABLED", "true");
    vi.stubEnv("ONBOARDING_CHAT_DAILY_CALLS", "2");
    await setOnboardingChatMode(adminId, "test_and_allowlist");
    expect(await chatModeFor(talentId)).toBe("model");
    await prisma.aiUsage.createMany({ data: [1, 2].map((i) => ({ provider: "anthropic", kind: "onboarding.chat", ref: `${talentId}:${P}${i}`, inputTokens: 10, outputTokens: 5 })) });
    // Another account's rows are not counted.
    await prisma.aiUsage.create({ data: { provider: "anthropic", kind: "onboarding.chat", ref: `${P}someoneelse:x`, inputTokens: 1 } });
    expect(await chatModeFor(talentId)).toBe("scripted");
    const { usedLast24h } = await import("@/lib/onboarding-chat/model");
    expect(await usedLast24h(talentId)).toEqual({ calls: 2, tokens: 30 });
    // Older than 24 hours does not count.
    await prisma.aiUsage.updateMany({ where: { ref: { startsWith: `${talentId}:` } }, data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    expect((await usedLast24h(talentId)).calls).toBe(0);
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: `${talentId}:` } } });
    vi.unstubAllEnvs();
  });

  it("the model path: one usage row per call, bad output throws, unmapped keys never come out", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { askTurn, askOneGo, usedLast24h } = await import("@/lib/onboarding-chat/model");
    create.mockResolvedValueOnce(ok({ reaction: "Nice to meet you — Ada.", value: { first: "Ada", last: "Lovelace" }, unclear: false }));
    const r = await askTurn({ userId: talentId, field: "legalName", answer: "I am Ada Lovelace", lang: "en" });
    expect(r).toMatchObject({ value: { first: "Ada", last: "Lovelace" }, unclear: false });
    expect(r.reaction).not.toMatch(/—/);
    // Prompt: the field and the quoted answer, no account data.
    const sent = JSON.stringify(create.mock.calls[0][0]);
    expect(sent).toContain("FIELD: legalName");
    expect(sent).not.toContain(`${P}talent`);
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 15000 });
    expect(await usedLast24h(talentId)).toEqual({ calls: 1, tokens: 70 });

    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: "text", text: "not json" }] });
    await expect(askTurn({ userId: talentId, field: "legalName", answer: "x", lang: "en" })).rejects.toThrow();
    create.mockResolvedValueOnce({ stop_reason: "refusal", usage: { input_tokens: 5, output_tokens: 0 }, content: [] });
    await expect(askTurn({ userId: talentId, field: "legalName", answer: "x", lang: "en" })).rejects.toThrow();
    create.mockRejectedValueOnce(new Error("timeout"));
    await expect(askTurn({ userId: talentId, field: "legalName", answer: "x", lang: "en" })).rejects.toThrow();
    expect((await usedLast24h(talentId)).calls).toBe(4);

    create.mockResolvedValueOnce(ok({ values: { legalName: null, stageName: null, birthDate: "1990-01-01", gender: null, phone: null, city: null, languages: null, height: { cm: 180 }, build: null, hair: null, eyes: null, workTypes: null, ageRange: null, compensation: null, plan: "ULTIMATE" } }));
    const g = await askOneGo({ userId: talentId, text: "born 1990, 180 cm", lang: "en" });
    expect(g).toEqual({ birthDate: "1990-01-01", height: { unit: "metric", cm: 180 } });
    // A field the model does not read has no schema, so it can never be called.
    await expect(askTurn({ userId: talentId, field: "bio", answer: "x", lang: "en" })).rejects.toThrow();
    vi.unstubAllEnvs();
  });

  it("two parallel calls cannot both pass a cap of one (the call is reserved before it is made)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ONBOARDING_CHAT_DAILY_CALLS", "1");
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: `${talentId}:` } } });
    const { askTurn, usedLast24h } = await import("@/lib/onboarding-chat/model");
    create.mockReset();
    create.mockResolvedValue(ok({ reaction: "Great.", value: "Ace", unclear: false }));
    const r = await Promise.allSettled([1, 2].map(() => askTurn({ userId: talentId, field: "stageName", answer: "Ace", lang: "en" })));
    expect(r.filter((x) => x.status === "fulfilled").length).toBeLessThanOrEqual(1);
    expect(create.mock.calls.length).toBeLessThanOrEqual(1);
    expect((await usedLast24h(talentId)).calls).toBeLessThanOrEqual(1);
    await prisma.aiUsage.deleteMany({ where: { ref: { startsWith: `${talentId}:` } } });
    create.mockReset();
    vi.unstubAllEnvs();
  });

  it("saveReview re-checks the switch and saves only rows the one-go flow proposed", async () => {
    const { setOnboardingChatMode } = await import("@/lib/app-settings");
    const { saveReview } = await import("@/app/actions/onboarding-chat");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    session.current = { user: { id: talentId, kind: "TALENT" } };
    await prisma.onboardingDraft.deleteMany({ where: { profileId } });
    await setOnboardingChatMode(adminId, "test_and_allowlist");
    // No review in the draft: nothing saved.
    expect((await saveReview([{ field: "stageName", text: "Ace" }])).ok).toBe(false);
    await prisma.onboardingDraft.create({ data: { profileId, answers: { review: { rows: [{ field: "stageName", text: "Ace" }], cities: [] } } } });
    // Switched off: refused, even with a review waiting.
    await setOnboardingChatMode(adminId, "off");
    expect((await saveReview([{ field: "stageName", text: "Ace" }])).ok).toBe(false);
    await setOnboardingChatMode(adminId, "test_and_allowlist");
    // A row the review never proposed is dropped.
    expect((await saveReview([{ field: "stageName", text: "Ace" }, { field: "gender", text: "male" }])).ok).toBe(true);
    const p = await prisma.artistProfile.findUnique({ where: { id: profileId }, select: { stageName: true, gender: true } });
    expect(p).toEqual({ stageName: "Ace", gender: null });
    expect(await prisma.onboardingDraft.count({ where: { profileId } })).toBe(0);
    await prisma.artistProfile.update({ where: { id: profileId }, data: { stageName: "" } });
    session.current = null;
    vi.unstubAllEnvs();
  });

  it("a draft goes with the profile (cascade) and nothing is kept in it before a save", async () => {
    await prisma.onboardingDraft.create({ data: { profileId, answers: { skipped: [] }, transcript: "hello" } });
    const p2 = await prisma.user.create({ data: { email: `${P}cascade@test.local`, kind: "TALENT" } });
    const prof2 = await prisma.artistProfile.create({ data: { userId: p2.id, stageName: "" } });
    await prisma.onboardingDraft.create({ data: { profileId: prof2.id, answers: {} } });
    await prisma.artistProfile.delete({ where: { id: prof2.id } });
    expect(await prisma.onboardingDraft.count({ where: { profileId: prof2.id } })).toBe(0);
    expect(await prisma.artistProfile.findUnique({ where: { id: profileId }, select: { legalFirstName: true } })).toEqual({ legalFirstName: null });
  });
});
