import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MAX_MODEL_INPUT_CHARS } from "@/domain/workflow/limits";
import type { FitModel, FitModelRequest, FitModelResponse } from "./model";

/**
 * The Anthropic-backed role-fit adapter. Loaded only when
 * WORKFLOW_MODEL_ENABLED is set (see getFitModel).
 *
 * It makes one request and reports what it cost. It does not retry: the SDK
 * retries are switched off because the engine owns retries, the timeout and
 * the spend caps, and a hidden second request would escape all three.
 *
 * The test suite uses a fake in its place. The live API has never been
 * called from here.
 */

const MODEL = "claude-opus-5-5";
// List prices of that model, in micro-USD per token: $4 and $20 per million.
const INPUT_MICRO_USD_PER_TOKEN = 4;
const OUTPUT_MICRO_USD_PER_TOKEN = 20;
const MAX_OUTPUT_TOKENS = 6000;
// Worst case for the input: one token per character of the record, plus the
// instruction and the output format the API adds.
const MAX_INPUT_TOKENS = MAX_MODEL_INPUT_CHARS + 2000;

/**
 * The answer's outline, for the API's structured output. Kept free of length
 * limits on purpose: the engine validates every answer against the strict
 * schema in src/domain/workflow/fit.ts, and that check is the one that counts.
 */
const AnswerFormat = z.object({
  decision: z.enum(["eligible", "needs_review", "ineligible"]),
  rules_passed: z.array(z.object({ rule: z.string(), fields: z.array(z.string()) })),
  rule_failures: z.array(
    z.object({ rule: z.string(), reason: z.string(), fields: z.array(z.string()) })
  ),
  unknowns: z.array(z.object({ question: z.string(), fields: z.array(z.string()) })),
  reasons: z.array(z.string()),
  profile_evidence: z.array(z.object({ field: z.string(), excerpt: z.string().nullable() })),
  brief_evidence: z.array(z.object({ field: z.string(), excerpt: z.string().nullable() })),
});

export class AnthropicFitModel implements FitModel {
  readonly version = `${MODEL}:fit-1`;
  readonly maxCostPerCallMicroUsd =
    MAX_INPUT_TOKENS * INPUT_MICRO_USD_PER_TOKEN +
    MAX_OUTPUT_TOKENS * OUTPUT_MICRO_USD_PER_TOKEN;

  private client = new Anthropic();

  async assess(request: FitModelRequest): Promise<FitModelResponse> {
    const response = await this.client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { effort: "low", format: zodOutputFormat(AnswerFormat) },
      },
      { signal: request.signal, timeout: request.timeoutMs, maxRetries: 0 }
    );

    const usage = response.usage;
    const inputTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const costMicroUsd =
      inputTokens * INPUT_MICRO_USD_PER_TOKEN +
      usage.output_tokens * OUTPUT_MICRO_USD_PER_TOKEN;

    if (response.stop_reason === "refusal") {
      return { text: "", costMicroUsd, refused: true };
    }
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    return { text, costMicroUsd };
  }
}
