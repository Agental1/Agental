import { modelEnabled, type WorkflowEnv } from "./config";

/**
 * The model adapter of the role-fit step.
 *
 * The engine only knows this interface: it hands over the fixed system
 * instruction and the record as text, and gets text back with what the call
 * cost. Parsing, validation, retries, the timeout and the spend caps all
 * stay in the engine (./evaluate), so they hold for any adapter, and tests
 * inject a fake.
 */
export interface FitModelRequest {
  /** The contract, word for word. */
  system: string;
  /** The record as one JSON document. */
  user: string;
  /** Aborted when the engine's timeout fires. */
  signal: AbortSignal;
  timeoutMs: number;
}

export interface FitModelResponse {
  /** The model's raw answer. Empty when it declined. */
  text: string;
  /** What this call cost, in micro-USD. */
  costMicroUsd: number;
  /** True when the model declined to answer. The engine does not retry. */
  refused?: boolean;
}

export interface FitModel {
  /** Stored on each evaluation and part of its input hash. */
  readonly version: string;
  /**
   * The most one call can cost, in micro-USD. The engine reserves this much
   * before every call, so a cap is never crossed by a call already made.
   */
  readonly maxCostPerCallMicroUsd: number;
  assess(request: FitModelRequest): Promise<FitModelResponse>;
}

/**
 * The model to use, or null when the step is off.
 *
 * Off is the default: unless WORKFLOW_MODEL_ENABLED is set, the rules decide
 * alone. Switched on without a key is a deployment error and is refused
 * here, in the same spirit as getScorer: a workflow that believes it has a
 * model and silently runs without one would mislabel every result.
 */
export async function getFitModel(env: WorkflowEnv = process.env): Promise<FitModel | null> {
  if (!modelEnabled(env)) return null;
  // Round 9: the pause switch (Admin > Controls) stops every model call; the rules decide alone.
  const { isPaused } = await import("@/lib/app-settings");
  if (await isPaused()) return null;
  if (!(env.ANTHROPIC_API_KEY ?? "").trim()) {
    throw new Error(
      "WORKFLOW_MODEL_ENABLED requires ANTHROPIC_API_KEY. Set it, or unset " +
        "WORKFLOW_MODEL_ENABLED to let the rules decide alone."
    );
  }
  // Lazy import so the SDK loads only when the model step is on.
  const { AnthropicFitModel } = await import("./anthropic-fit-model");
  return new AnthropicFitModel();
}
