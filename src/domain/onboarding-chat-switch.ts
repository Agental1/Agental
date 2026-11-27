import { createHash } from "node:crypto";

/**
 * Round 12, group 6: the "Onboarding as a conversation" switch, as pure rules.
 *
 * The setting (AppSetting `onboarding.chat`) holds a mode and an allowlist. An
 * allowlist entry is a plain email or `sha256:<hex of the lowercased email>`;
 * hashed entries keep an address out of this public repository. Server only
 * (node:crypto).
 */
export const CHAT_MODES = ["off", "test_and_allowlist", "everyone"] as const;
export type ChatSwitchMode = (typeof CHAT_MODES)[number];

export interface ChatSetting {
  mode: ChatSwitchMode;
  allowlist: string[];
  since: string | null;
}

export function isChatSwitchMode(v: unknown): v is ChatSwitchMode {
  return typeof v === "string" && (CHAT_MODES as readonly string[]).includes(v);
}

const HASH_PREFIX = "sha256:";
const HEX64 = /^[0-9a-f]{64}$/;

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** One allowlist entry as saved: an email lowercased and trimmed, or a valid hash; anything else null. */
export function normalizeAllowlistEntry(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith(HASH_PREFIX)) return HEX64.test(v.slice(HASH_PREFIX.length)) ? v : null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254 ? v : null;
}

/** Entries staff typed (one per line or comma separated) to the list to store, hashed entries kept as they are. */
export function parseAllowlistInput(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map(normalizeAllowlistEntry).filter((e): e is string => !!e))];
}

export const isHashedEntry = (entry: string) => entry.startsWith(HASH_PREFIX);

/**
 * The stored value as a setting. Missing: Test accounts only (empty list).
 * Unreadable: off (fail safe).
 */
export function parseChatSetting(raw: string | null | undefined): ChatSetting {
  if (raw === null || raw === undefined) return { mode: "test_and_allowlist", allowlist: [], since: null };
  try {
    const v = JSON.parse(raw) as { mode?: unknown; allowlist?: unknown; since?: unknown };
    if (!v || typeof v !== "object" || !isChatSwitchMode(v.mode)) return { mode: "off", allowlist: [], since: null };
    const list = Array.isArray(v.allowlist) ? v.allowlist.filter((e): e is string => typeof e === "string").map(normalizeAllowlistEntry).filter((e): e is string => !!e) : [];
    return { mode: v.mode, allowlist: [...new Set(list)], since: typeof v.since === "string" ? v.since : null };
  } catch {
    return { mode: "off", allowlist: [], since: null };
  }
}

/** Is this account email on the list, as a plain entry or through its hash? */
export function onAllowlist(allowlist: readonly string[], email: string | null | undefined): boolean {
  if (!email) return false;
  const plain = email.trim().toLowerCase();
  const hashed = `${HASH_PREFIX}${hashEmail(plain)}`;
  return allowlist.some((e) => e === plain || e === hashed);
}

/** What the admin page shows: plain addresses, and a count for the hidden ones. */
export function allowlistForDisplay(allowlist: readonly string[]): { plain: string[]; hidden: number } {
  return { plain: allowlist.filter((e) => !isHashedEntry(e)), hidden: allowlist.filter(isHashedEntry).length };
}

/** Who may see the chat at all. */
export function chatVisibleTo(setting: ChatSetting, account: { email: string | null; accountStatus: string | null | undefined }): boolean {
  if (setting.mode === "off") return false;
  if (setting.mode === "everyone") return true;
  return account.accountStatus === "TEST" || onAllowlist(setting.allowlist, account.email);
}

export type ChatMode = "form" | "scripted" | "model";

/**
 * One function for every fallback: switch off or not allowed -> form only;
 * no key, model disabled, pause, test workflow mode for a non-Test account,
 * cap or budget reached -> scripted flow; otherwise the model.
 */
export function decideChatMode(f: {
  setting: ChatSetting;
  email: string | null;
  accountStatus: string | null | undefined;
  modelEnabled: boolean;
  paused: boolean;
  workflowLive: boolean;
  capReached: boolean;
  budgetReached: boolean;
}): ChatMode {
  if (!chatVisibleTo(f.setting, { email: f.email, accountStatus: f.accountStatus })) return "form";
  if (!f.modelEnabled || f.paused || f.capReached || f.budgetReached) return "scripted";
  if (!f.workflowLive && f.accountStatus !== "TEST") return "scripted";
  if (f.workflowLive && ["SPAM", "REVOKED"].includes(f.accountStatus ?? "")) return "scripted";
  return "model";
}

/** Per-account cap over a rolling 24 hours (design section 3). */
export const DEFAULT_DAILY_CALLS = 30;
export const DEFAULT_DAILY_TOKENS = 40_000;

export function chatCaps(env: Record<string, string | undefined> = process.env) {
  const n = (v: string | undefined, d: number) => {
    const x = Number((v ?? "").trim());
    return (v ?? "").trim() !== "" && Number.isInteger(x) && x >= 0 ? x : d;
  };
  return { calls: n(env.ONBOARDING_CHAT_DAILY_CALLS, DEFAULT_DAILY_CALLS), tokens: n(env.ONBOARDING_CHAT_DAILY_TOKENS, DEFAULT_DAILY_TOKENS) };
}

export function capReached(used: { calls: number; tokens: number }, caps = chatCaps()): boolean {
  return used.calls >= caps.calls || used.tokens >= caps.tokens;
}
