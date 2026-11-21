import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AssistantContext } from "@/domain/assistant";

/**
 * The model behind the assistant, when it is switched on
 * (ASSISTANT_MODEL_ENABLED=true and an Anthropic credential). One request,
 * a short answer, and a yes/no on whether a person should take over.
 */
export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-5-5";
/** Short support replies do not need a large model: Haiku by default, ASSISTANT_MODEL to change. */
export function assistantModel(env = process.env): string {
  return (env.ASSISTANT_MODEL ?? "").trim() || DEFAULT_ASSISTANT_MODEL;
}
/** Hard cap on one reply, in tokens. */
export const MAX_REPLY_TOKENS = 300;
/** Replies per performer per day before messages go to the team (ASSISTANT_DAILY_LIMIT). */
export function assistantDailyLimit(env = process.env): number {
  const n = Number(env.ASSISTANT_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 0 ? n : 20;
}
const TIMEOUT_MS = 15_000;

export function assistantModelEnabled(env = process.env): boolean {
  return env.ASSISTANT_MODEL_ENABLED === "true" && !!(env.ANTHROPIC_API_KEY ?? "").trim();
}

const Answer = z.object({
  reply: z.string(),
  needs_human: z.boolean(),
});

const SYSTEM = `You are the Agental assistant, answering performers (actors, voice actors, models, musicians) inside the Messages page of agental.co. Agental is in a U.S. beta: performers build a profile and prepare casting materials; the Agental team reviews every application draft before anything is sent. Agental does not represent performers during the beta.

You receive the performer's question, the topic they picked, the last messages of the conversation, and a CONTEXT object with the only facts you know about them. Answer from those facts alone.

Rules:
- Reply in the language of the performer's question. Two to four short sentences, plain text, no markdown headings, no em dashes.
- Use only facts present in CONTEXT or in the conversation. Never invent roles, castings, dates, prices, deadlines or outcomes. Never promise work or results.
- Profile questions: use completeness, missing items, specialties and preferences to say concretely what to do next and where (Profile page, Reel & Self-tape, Your website).
- Application questions: report the statuses you see. You do not know why a casting team decided anything.
- Set needs_human to true when the answer is not in CONTEXT, when the question is about money, contracts, legal matters, a specific casting decision, a complaint, safety, or anything you are not confident about. In that case keep the reply to one or two sentences saying you are passing it to the Agental team; do not guess.
- Plan names shown to performers: FREE is "Basic", then Pro, Premium, Ultimate.`;

export async function askModel(input: {
  ctx: AssistantContext;
  question: string;
  history: { from: "performer" | "team" | "assistant"; body: string }[];
  signal?: AbortSignal;
}): Promise<{ reply: string; needsHuman: boolean }> {
  const client = new Anthropic();
  const transcript = input.history
    .slice(-6)
    .map((m) => `${m.from}: ${m.body}`)
    .join("\n");
  // No retry on another model: a refusal or any error falls back to the rules.
  const response = await client.messages.create(
    {
      model: assistantModel(),
      max_tokens: MAX_REPLY_TOKENS,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(Answer) },
      messages: [
        {
          role: "user",
          content:
            `TOPIC: ${input.ctx.topic}\n` +
            `CONTEXT: ${JSON.stringify(input.ctx)}\n` +
            (transcript ? `RECENT CONVERSATION:\n${transcript}\n` : "") +
            `QUESTION: ${input.question}`,
        },
      ],
    },
    { signal: input.signal, timeout: TIMEOUT_MS, maxRetries: 0 }
  );
  // A refusal, a cut-off answer or unreadable output: the caller uses the rules.
  if (response.stop_reason !== "end_turn") throw new Error("model_unusable");
  const text = response.content.find((b) => b.type === "text");
  const parsed = Answer.safeParse(text && text.type === "text" ? JSON.parse(text.text) : null);
  if (!parsed.success || !parsed.data.reply.trim()) throw new Error("model_unusable");
  return { reply: parsed.data.reply.trim(), needsHuman: parsed.data.needs_human };
}
