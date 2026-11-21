import { z } from "zod";

/**
 * Messages answered by the n8n "Beta V2" website support entry (round 7,
 * Part C3), behind a staging flag. Off unless all three are set:
 *
 *   AGENTAL_FIND_STAGING=1
 *   N8N_SUPPORT_WEBHOOK_URL   the workflow's "Website Support Request" URL (https)
 *   N8N_SHARED_SECRET         sent as `Authorization: Bearer <secret>`
 *
 * Only the question leaves the app (no name, email or profile data). Any
 * failure or unexpected answer returns null and the in-app rules answer as
 * before. Samantha and Adrian share one engine; the name is cosmetic.
 */

type Env = Record<string, string | undefined>;

export function n8nSupportConfig(env: Env = process.env): { url: string; secret: string } | null {
  if ((env.AGENTAL_FIND_STAGING ?? "").trim() !== "1") return null;
  const url = (env.N8N_SUPPORT_WEBHOOK_URL ?? "").trim();
  const secret = (env.N8N_SHARED_SECRET ?? "").trim();
  if (!url.startsWith("https://") || secret.length < 24) return null;
  return { url, secret };
}

const SupportAnswer = z.object({
  kind: z.enum(["answer", "human_handoff"]),
  answer: z.string().trim().min(1).max(2000),
});

export interface SupportReply {
  text: string;
  handoff: boolean;
}

export async function askN8nSupport(
  input: { requestId: string; question: string; assistant?: "Samantha" | "Adrian" },
  deps: { env?: Env; fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<SupportReply | null> {
  const cfg = n8nSupportConfig(deps.env ?? process.env);
  if (!cfg) return null;
  const send = deps.fetch ?? fetch;
  try {
    const res = await send(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128),
        assistant: input.assistant ?? "Samantha",
        question: input.question.slice(0, 4000),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 20_000),
    });
    if (!res.ok) return null;
    const parsed = SupportAnswer.safeParse(await res.json());
    if (!parsed.success) return null;
    return { text: parsed.data.answer, handoff: parsed.data.kind === "human_handoff" };
  } catch (error) {
    console.error("[n8n] support answer unavailable:", error instanceof Error ? error.name : "Error");
    return null;
  }
}
