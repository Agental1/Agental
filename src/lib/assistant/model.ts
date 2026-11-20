import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AssistantContext } from "@/domain/assistant";

/**
 * The model behind the assistant, when it is switched on
 * (ASSISTANT_MODEL_ENABLED=true and an Anthropic credential). One request,
 * a short answer, and a yes/no on whether a person should take over.
 */
export const ASSISTANT_MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 25_000;

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
- Reply in the language of the performer's question. Three to six short sentences, plain text, no markdown headings, no em dashes.
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
  // Server-side fallback: if the model declines on a safety classifier, the
  // API re-runs the same request on the fallback model inside this call.
  const response = await client.beta.messages.create(
    {
      model: ASSISTANT_MODEL,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Answer) },
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
    { signal: input.signal, timeout: TIMEOUT_MS, maxRetries: 1 }
  );
  if (response.stop_reason === "refusal") return { reply: "", needsHuman: true };
  const text = response.content.find((b) => b.type === "text");
  const parsed = Answer.safeParse(text && text.type === "text" ? JSON.parse(text.text) : null);
  if (!parsed.success || !parsed.data.reply.trim()) return { reply: "", needsHuman: true };
  return { reply: parsed.data.reply.trim(), needsHuman: parsed.data.needs_human };
}
