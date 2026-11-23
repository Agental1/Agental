import { askN8nSupport, n8nSupportConfig } from "@/lib/n8n/support";
import en from "../../../messages/en/talents.json";
import fr from "../../../messages/fr/talents.json";
import es from "../../../messages/es/talents.json";
import zh from "../../../messages/zh/talents.json";
import { toLocale, type Locale } from "@/i18n/routing";
import {
  answerByRules,
  type AssistantAnswer,
  type AssistantContext,
  type AssistantStrings,
  type MessageTopic,
} from "@/domain/assistant";
import { buildAssistantContext } from "./context";
import { prisma } from "@/lib/db";
import { askModel, clip, assistantDailyLimit, assistantModelEnabled, assistantMonthlyBudgetUsd, HAIKU_PRICE, assistantModel } from "./model";
import { workflowMode } from "@/domain/workflow/eligibility";

/**
 * Answer a performer's message as the Agental assistant: the model when it is
 * switched on, otherwise (or when it fails) the rule-based answer. Either way
 * the answer says when a person has to take over.
 */
const ALL = { en, fr, es, zh } as const;
type Raw = (typeof en)["space"]["assistant"];

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

export function assistantStrings(locale: Locale): { s: AssistantStrings; raw: Raw; planNames: string[] } {
  const pack = ALL[locale] ?? ALL.en;
  const raw = pack.space.assistant as Raw;
  const statuses = pack.space.candidatures.status as Record<string, string>;
  const gaps = pack.space.dashboard.missing as Record<string, string>;
  const s: AssistantStrings = {
    greeting: (name) => (name ? fill(raw.greeting, { name }) : raw.greetingAnon),
    profileStatus: (percent, next) =>
      next ? fill(raw.profileStatus, { percent, next }) : fill(raw.profileStatusNoNext, { percent }),
    profileComplete: raw.profileComplete,
    missing: (key) => gaps[key] ?? key,
    noApplications: raw.noApplications,
    applicationsIntro: (count) => fill(raw.applicationsIntro, { count }),
    applicationLine: (title, status) => fill(raw.applicationLine, { title, status: statuses[status] ?? status }),
    searches: (count) => fill(raw.searches, { count }),
    plan: (planName) => fill(raw.plan, { plan: planName }),
    handoff: raw.handoff,
  };
  const planNames = (pack.pricing.plans as { name: string }[]).map((p) => p.name);
  return { s, raw, planNames };
}

const PLAN_INDEX = { FREE: 0, PRO: 1, PREMIUM: 2, ULTIMATE: 3 } as const;

/** Test accounts only, and under the assistant's daily cap. */
async function n8nSupportAllowed(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
  if (u?.accountStatus !== "TEST") return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = await prisma.message.count({
    where: { fromAgent: true, createdAt: { gte: since }, thread: { userId, kind: "TEAM" } },
  });
  const plan = (await prisma.subscription.findUnique({ where: { subjectId: userId }, select: { plan: true } }))?.plan;
  return today < assistantDailyLimit(plan === "PRO" || plan === "PREMIUM" || plan === "ULTIMATE" ? plan : "FREE");
}

/** Model replies to this performer in the last 24 hours (rules answers and notes do not count). */
async function repliesToday(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const mine = await prisma.message.findMany({ where: { senderId: userId, createdAt: { gte: since } }, select: { id: true }, take: 500 });
  if (mine.length === 0) return 0;
  return prisma.aiUsage.count({ where: { kind: "assistant.reply", ref: { in: mine.map((m) => m.id) } } });
}

/** What the assistant's model calls cost this calendar month (UTC), in micro-dollars. */
async function spentThisMonthMicro(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const r = await prisma.aiUsage.aggregate({ where: { kind: "assistant.reply", createdAt: { gte: start } }, _sum: { costMicroUsd: true } });
  return r._sum.costMicroUsd ?? 0;
}

/** Round 9: the cost of one reply, once per performer message. Never blocks the answer. */
async function recordReplyUsage(ref: string | undefined, usage: { inputTokens: number; outputTokens: number } | undefined) {
  if (!ref || !usage) return;
  const cost = usage.inputTokens * HAIKU_PRICE.inputPerToken + usage.outputTokens * HAIKU_PRICE.outputPerToken;
  await prisma.aiUsage
    .createMany({
      data: [{ provider: "anthropic", kind: "assistant.reply", ref, model: assistantModel(), inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, requests: 1, costMicroUsd: Math.round(cost * 1e6) }],
      skipDuplicates: true,
    })
    .catch((e) => console.error("[assistant] usage not recorded", e instanceof Error ? e.name : "error"));
}

/**
 * Round 9: who gets the model. In test mode (WORKFLOW_MODE not "live") only
 * Test accounts, like the agents; in live mode everyone but spam, revoked or
 * deleted accounts. Everyone else gets the rule-based answers.
 */
async function modelAllowedFor(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true, deletedAt: true } });
  if (!u || u.deletedAt) return false;
  if (workflowMode() !== "live") return u.accountStatus === "TEST";
  return !["SPAM", "REVOKED"].includes(u.accountStatus);
}

export async function answerMessage(input: {
  userId: string;
  topic: MessageTopic;
  question: string;
  locale: string;
  history: { from: "performer" | "team" | "assistant"; body: string }[];
  /** The performer's message id: one n8n request per message. */
  requestId?: string;
}): Promise<AssistantAnswer & { ctx: AssistantContext }> {
  const locale = toLocale(input.locale);
  const ctx = await buildAssistantContext(input.userId, input.topic, locale);
  const { s, raw, planNames } = assistantStrings(locale);
  const planName = planNames[PLAN_INDEX[ctx.plan]] ?? ctx.plan;

  // Staging only: the n8n support entry answers (AGENTAL_FIND_STAGING=1),
  // for test accounts only, under the same daily cap as the model.
  if (input.requestId && n8nSupportConfig() && (await n8nSupportAllowed(input.userId)) && (await modelAllowedFor(input.userId))) {
    const n8n = await askN8nSupport({ requestId: input.requestId, question: input.question });
    if (n8n) {
      const text = n8n.handoff ? `${clip(n8n.text)}\n${raw.handoff}` : clip(n8n.text);
      return { text, handoff: n8n.handoff, source: "model", ctx };
    }
  }

  let note: string | null = null;
  if (assistantModelEnabled() && (await modelAllowedFor(input.userId))) {
    // Caps (round 9): replies per performer per day by plan, and a monthly
    // budget for everyone. Past either, the rule-based answer with a short note.
    if ((await repliesToday(input.userId)) >= assistantDailyLimit(ctx.plan)) note = raw.limitToday;
    else if ((await spentThisMonthMicro()) >= assistantMonthlyBudgetUsd() * 1e6) note = raw.limitMonth;
    else {
      try {
        const res = await askModel({ ctx, question: input.question, history: input.history });
        await recordReplyUsage(input.requestId, res.usage);
        const text = res.needsHuman ? `${res.reply}\n${raw.handoff}` : res.reply;
        return { text, handoff: res.needsHuman, source: "model", ctx };
      } catch (error) {
        await recordReplyUsage(input.requestId, (error as { usage?: { inputTokens: number; outputTokens: number } }).usage);
        console.error("[assistant] model failed, rules used", error instanceof Error ? error.name : "error");
      }
    }
  }
  const rules = answerByRules(input.question, ctx, s, planName);
  return { ...rules, text: note ? `${note}\n${rules.text}` : rules.text, ctx };
}
