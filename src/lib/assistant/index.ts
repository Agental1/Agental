import { askN8nSupport } from "@/lib/n8n/support";
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
import { askModel, assistantDailyLimit, assistantModelEnabled } from "./model";

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

  // Staging only: the n8n support entry answers (AGENTAL_FIND_STAGING=1).
  if (input.requestId) {
    const n8n = await askN8nSupport({ requestId: input.requestId, question: input.question });
    if (n8n) {
      const text = n8n.handoff ? `${n8n.text}\n${raw.handoff}` : n8n.text;
      return { text, handoff: n8n.handoff, source: "model", ctx };
    }
  }

  if (assistantModelEnabled()) {
    // Daily cap per performer: past it, messages go to the team.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = await prisma.message.count({
      where: { fromAgent: true, createdAt: { gte: since }, thread: { userId: input.userId, kind: "TEAM" } },
    });
    if (today >= assistantDailyLimit()) {
      return { text: raw.handoff, handoff: true, source: "rules", ctx };
    }
    try {
      const res = await askModel({ ctx, question: input.question, history: input.history });
      const text = res.needsHuman ? `${res.reply}\n${raw.handoff}` : res.reply;
      return { text, handoff: res.needsHuman, source: "model", ctx };
    } catch (error) {
      console.error("[assistant] model failed, rules used", error instanceof Error ? error.name : "error");
    }
  }
  return { ...answerByRules(input.question, ctx, s, planName), ctx };
}
