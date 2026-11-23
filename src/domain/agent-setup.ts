import { z } from "zod";

/**
 * The AI agent setup in Messages (round 8b). Saved on the account; the agent
 * itself is not live (round 9), so nothing reads these choices yet.
 */
export const AGENT_NAMES = ["samantha", "adrian", "custom"] as const;
export const AGENT_HELPS = ["roles", "profile", "selftape", "draft"] as const;
export type AgentNameChoice = (typeof AGENT_NAMES)[number];
export type AgentHelp = (typeof AGENT_HELPS)[number];
export const AGENT_CUSTOM_NAME_MAX = 40;

export const AgentSetupInput = z
  .object({
    name: z.enum(AGENT_NAMES),
    customName: z.string().trim().max(AGENT_CUSTOM_NAME_MAX).optional(),
    helps: z.array(z.enum(AGENT_HELPS)).min(1).max(AGENT_HELPS.length),
  })
  .refine((v) => v.name !== "custom" || (v.customName ?? "").length > 0, { path: ["customName"] });
export type AgentSetupInput = z.infer<typeof AgentSetupInput>;

export interface AgentSetup {
  name: AgentNameChoice;
  customName: string | null;
  helps: AgentHelp[];
}

/** The saved setup from the profile row, or null when none was saved. */
export function agentSetupOf(row: {
  agentNameChoice: string | null;
  agentCustomName: string | null;
  agentHelps: string | null;
  agentSavedAt: Date | null;
}): AgentSetup | null {
  if (!row.agentSavedAt) return null;
  const name = AGENT_NAMES.find((n) => n === row.agentNameChoice);
  if (!name) return null;
  let helps: AgentHelp[] = [];
  try {
    const raw = JSON.parse(row.agentHelps ?? "[]") as unknown;
    if (Array.isArray(raw)) helps = AGENT_HELPS.filter((h) => raw.includes(h));
  } catch {
    helps = [];
  }
  return { name, customName: name === "custom" ? row.agentCustomName : null, helps };
}

const AGENT_DISPLAY: Record<Exclude<AgentNameChoice, "custom">, string> = {
  samantha: "Samantha",
  adrian: "Adrian",
};

/**
 * Round 8d: the name the performer gave their agent ("Sam"), shown as the
 * author of its replies, in the conversation header, its avatar initial and
 * the bell. Null when no name is saved: callers then say "Agental assistant".
 */
export function agentDisplayName(setup: AgentSetup | null): string | null {
  if (!setup) return null;
  if (setup.name === "custom") return setup.customName?.trim() || null;
  return AGENT_DISPLAY[setup.name];
}

/** The first letter of a name, for an avatar ("Sam" -> "S"). */
export function nameInitial(name: string): string {
  const first = Array.from(name.trim())[0] ?? "?";
  return first.toLocaleUpperCase();
}
