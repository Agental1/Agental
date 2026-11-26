import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assistantModel, HAIKU_PRICE, assistantMonthlyBudgetUsd } from "@/lib/assistant/model";
import { BUILDS, EYE_COLORS, GENDERS, HAIR_COLORS } from "@/domain/identity";
import { COMPENSATION, PROJECT_TYPES, ROLE_TYPES } from "@/domain/preferences";
import { ANSWER_MAX, ONE_GO_MAX, ONE_GO_FIELDS, type ChatFieldId } from "@/domain/onboarding-chat";
import { chatCaps, capReached } from "@/domain/onboarding-chat-switch";
import { oneGoSystemPrompt, oneGoUserPrompt, turnSystemPrompt, turnUserPrompt } from "./prompt";

/**
 * The model calls of the onboarding chat (round 12, group 6): the same client,
 * key and model as the assistant, `maxRetries: 0`, 15 s timeout. Output only
 * through a schema built for the field asked. Usage is recorded in AiUsage
 * (kind "onboarding.chat", ref "<userId>:<uuid>") and counted per account over
 * a rolling 24 hours before every call.
 */
export const CHAT_KIND = "onboarding.chat";
const TIMEOUT_MS = 15_000;
export const TURN_MAX_TOKENS = 200;
export const ONE_GO_MAX_TOKENS = 700;
export const REACTION_MAX = 120;

export interface Usage { inputTokens: number; outputTokens: number }

const nameVal = z.object({ first: z.string(), last: z.string() });

/** The schema for ONE field: { reaction, value, unclear }. Fields the model does not read have none. */
export function turnSchema(field: ChatFieldId) {
  const value = (() => {
    switch (field) {
      case "legalName": return nameVal;
      case "stageName": case "birthDate": case "phone": case "city": return z.string();
      case "languages": return z.array(z.string());
      case "height": return z.object({ cm: z.number() });
      case "ageRange": return z.object({ min: z.number(), max: z.number() });
      case "dayRate": case "weightKg": return z.number();
      default: return null;
    }
  })();
  return value ? z.object({ reaction: z.string(), value: value.nullable(), unclear: z.boolean() }) : null;
}

const OneGo = z.object({
  values: z.object({
    legalName: nameVal.nullable(),
    stageName: z.string().nullable(),
    birthDate: z.string().nullable(),
    gender: z.enum(GENDERS).nullable(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
    languages: z.array(z.string()).nullable(),
    height: z.object({ cm: z.number() }).nullable(),
    build: z.enum(BUILDS).nullable(),
    hair: z.enum(HAIR_COLORS).nullable(),
    eyes: z.enum(EYE_COLORS).nullable(),
    workTypes: z.object({ projectTypes: z.array(z.enum(PROJECT_TYPES)), roleTypes: z.array(z.enum(ROLE_TYPES)) }).nullable(),
    ageRange: z.object({ min: z.number(), max: z.number() }).nullable(),
    compensation: z.enum(COMPENSATION).nullable(),
  }),
});

/** A model value in the shape validateAnswer takes. Heights arrive in centimeters. */
export function normalizeModelValue(field: ChatFieldId, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (field === "height") return typeof (raw as { cm?: unknown }).cm === "number" ? { unit: "metric", cm: Math.round((raw as { cm: number }).cm) } : null;
  return raw;
}

/** One sentence, 120 characters at most, no em dash; null when empty. */
export function cleanReaction(text: string): string | null {
  const s = text.replace(/[—–]/g, ",").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length <= REACTION_MAX) return s;
  const cut = s.slice(0, REACTION_MAX);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return end > 20 ? cut.slice(0, end + 1) : null;
}

/** What this account used in the last 24 hours (rolling), from AiUsage. */
export async function usedLast24h(userId: string, now = new Date()) {
  const where = { kind: CHAT_KIND, ref: { startsWith: `${userId}:` }, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } };
  const r = await prisma.aiUsage.aggregate({ where, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } });
  return { calls: r._count._all, tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0) };
}

export async function accountCapReached(userId: string, now = new Date()): Promise<boolean> {
  return capReached(await usedLast24h(userId, now), chatCaps());
}

/** The chat's cost counts toward the assistant's monthly budget: both kinds. */
export async function budgetReached(now = new Date()): Promise<boolean> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const r = await prisma.aiUsage.aggregate({ where: { kind: { in: [CHAT_KIND, "assistant.reply"] }, createdAt: { gte: start } }, _sum: { costMicroUsd: true } });
  return (r._sum.costMicroUsd ?? 0) / 1e6 >= assistantMonthlyBudgetUsd();
}

/**
 * Reserve the call before it is made: the usage row is written first, then the
 * cap is counted with it. Two parallel requests both see each other's row, so
 * neither can pass the call cap (at worst both stop). Over the cap or the
 * token budget: the row is removed and the caller falls back.
 */
async function reserve(userId: string): Promise<string> {
  const ref = `${userId}:${randomUUID()}`;
  const row = await prisma.aiUsage.create({ data: { provider: "anthropic", kind: CHAT_KIND, ref, model: assistantModel(), inputTokens: 0, outputTokens: 0, requests: 1, costMicroUsd: 0 } });
  const used = await usedLast24h(userId);
  const caps = chatCaps();
  if (used.calls > caps.calls || used.tokens >= caps.tokens) {
    await prisma.aiUsage.delete({ where: { id: row.id } }).catch(() => undefined);
    throw new Error("cap_reached");
  }
  return row.id;
}

async function record(id: string, usage: Usage) {
  const cost = usage.inputTokens * HAIKU_PRICE.inputPerToken + usage.outputTokens * HAIKU_PRICE.outputPerToken;
  await prisma.aiUsage
    .update({ where: { id }, data: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costMicroUsd: Math.round(cost * 1e6) } })
    .catch((e) => console.error("[onboarding-chat] usage not recorded", e instanceof Error ? e.name : "error"));
}

async function call(userId: string, params: { system: string; user: string; maxTokens: number; format: ReturnType<typeof zodOutputFormat> }): Promise<unknown> {
  const id = await reserve(userId);
  const client = new Anthropic();
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const response = await client.messages.create(
      { model: assistantModel(), max_tokens: params.maxTokens, system: params.system, output_config: { format: params.format }, messages: [{ role: "user", content: params.user }] },
      { timeout: TIMEOUT_MS, maxRetries: 0 }
    );
    usage = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 };
    if (response.stop_reason !== "end_turn") throw new Error("model_unusable");
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("model_unusable");
    return JSON.parse(text.text);
  } finally {
    // One usage row per call, success or not, so the cap counts it.
    await record(id, usage);
  }
}

export interface TurnResult { reaction: string | null; value: unknown; unclear: boolean }

/** Read one free-text answer for one field. Throws on any failure: the caller falls back. */
export async function askTurn(input: { userId: string; field: ChatFieldId; answer: string; lang: string }): Promise<TurnResult> {
  const schema = turnSchema(input.field);
  if (!schema) throw new Error("field_not_read_by_model");
  const raw = await call(input.userId, {
    system: turnSystemPrompt(),
    user: turnUserPrompt(input.field, input.answer.slice(0, ANSWER_MAX), input.lang),
    maxTokens: TURN_MAX_TOKENS,
    format: zodOutputFormat(schema),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error("model_unusable");
  const d = parsed.data as { reaction: string; value: unknown; unclear: boolean };
  return { reaction: cleanReaction(d.reaction), value: d.unclear ? null : normalizeModelValue(input.field, d.value), unclear: d.unclear };
}

/** The one-go extraction: values only, no free text. Keys outside the mapped list are impossible by schema. */
export async function askOneGo(input: { userId: string; text: string; lang: string }): Promise<Record<string, unknown>> {
  const raw = await call(input.userId, {
    system: oneGoSystemPrompt(),
    user: oneGoUserPrompt(input.text.slice(0, ONE_GO_MAX), input.lang),
    maxTokens: ONE_GO_MAX_TOKENS,
    format: zodOutputFormat(OneGo),
  });
  const parsed = OneGo.safeParse(raw);
  if (!parsed.success) throw new Error("model_unusable");
  const out: Record<string, unknown> = {};
  for (const k of ONE_GO_FIELDS) {
    const v = normalizeModelValue(k, (parsed.data.values as Record<string, unknown>)[k]);
    if (v !== null) out[k] = v;
  }
  return out;
}
