"use server";

import { err, type ErrorKey } from "@/domain/action-result";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { agentNameFor } from "@/lib/agent-name";
import { completenessInputOf, missingItems } from "@/domain/completeness";
import { readPreferences } from "@/domain/preferences";
import { isoDate } from "@/domain/age";
import {
  ANSWER_MAX,
  CHAT_FIELDS,
  ONE_GO_FIELDS,
  ONE_GO_MAX,
  chatQueue,
  formatForReview,
  leftForForm,
  mergePreferencesPatch,
  onlyAskedField,
  parseByRules,
  validateAnswer,
  valueFromReviewText,
  type ChatFieldId,
} from "@/domain/onboarding-chat";
import type { ChatMode } from "@/domain/onboarding-chat-switch";
import { saveDayRate, savePreferences, saveProfileIdentity, saveProfilePhysical, type SaveResult } from "@/app/actions/profile";
import { askOneGo, askTurn, accountCapReached } from "@/lib/onboarding-chat/model";
import { chatModeFor } from "@/lib/onboarding-chat/mode";

/**
 * Round 12, group 6: the onboarding chat's server side. Every action re-reads
 * the session and never takes a user id. A confirmed answer is saved at once
 * through the form's own action; anything not yet confirmed lives in
 * OnboardingDraft (server side, deleted with the profile).
 */

export type ChatScope = "onboarding" | "profile";
const ONBOARDING_FIELDS: ChatFieldId[] = ["legalName", "stageName", "birthDate", "gender", "phone"];
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TRIES = 2;

interface Draft {
  skipped: string[];
  tries: Record<string, number>;
  pending: { field: ChatFieldId; value: unknown } | null;
  cities: { geonameId: number; label: string }[];
  review: { rows: { field: ChatFieldId; text: string }[]; cities: { geonameId: number; label: string }[] } | null;
}
const emptyDraft = (): Draft => ({ skipped: [], tries: {}, pending: null, cities: [], review: null });

export interface ChatQuestion {
  id: ChatFieldId;
  kind: "chips" | "multi" | "text";
  options: string[];
  optional: boolean;
}

export interface ChatView {
  mode: ChatMode;
  agentName: string;
  question: ChatQuestion | null;
  /** A model-read value waiting for a yes. `text` is a short line to show. */
  pending: { field: ChatFieldId; text: string } | null;
  cities: { geonameId: number; label: string }[];
  skipped: string[];
  leftForForm: ChatFieldId[];
  photosMissing: boolean;
  done: boolean;
  review: Draft["review"];
  /** What the form needs to start from the saved values (onboarding wizard). */
  snapshot: { legalFirstName: string; legalLastName: string; stageName: string; birthDate: string; gender: string; genderOther: string; phone: string; phoneE164: string };
}

export type ChatStatus = "saved" | "confirm" | "retry" | "fallback" | "minor" | "skipped" | "cities" | "error";
export interface ChatReply {
  status: ChatStatus;
  /** A model-written reaction, already clean; otherwise reactionKey (a key under onboarding.chat.reactions). */
  reaction: string | null;
  reactionKey: string | null;
  error: ReturnType<typeof err> | null;
  view: ChatView;
}

async function ctx() {
  const session = await auth();
  if (!session?.user?.id || session.user.kind !== "TALENT") return null;
  const profile = await prisma.artistProfile.findUnique({
    where: { userId: session.user.id },
    include: { specialties: true, media: true, onboardingDraft: true },
  });
  return profile ? { userId: session.user.id, profile } : null;
}
type Ctx = NonNullable<Awaited<ReturnType<typeof ctx>>>;

function readDraft(row: Ctx["profile"]["onboardingDraft"]): Draft {
  if (!row || Date.now() - row.updatedAt.getTime() > DRAFT_TTL_MS) return emptyDraft();
  const a = (row.answers ?? {}) as Partial<Draft>;
  return {
    skipped: Array.isArray(a.skipped) ? a.skipped.filter((s) => typeof s === "string") : [],
    tries: a.tries && typeof a.tries === "object" ? a.tries : {},
    pending: a.pending && typeof a.pending === "object" ? a.pending : null,
    cities: Array.isArray(a.cities) ? a.cities : [],
    review: a.review ?? null,
  };
}

async function writeDraft(profileId: string, d: Draft, transcript?: string | null) {
  await prisma.onboardingDraft.upsert({
    where: { profileId },
    create: { profileId, answers: JSON.parse(JSON.stringify(d)), transcript: transcript ?? null },
    update: { answers: JSON.parse(JSON.stringify(d)), ...(transcript === undefined ? {} : { transcript }) },
  });
}
/** The switch, read fresh on every action: off or not on the list means the form only. */
async function chatAllowed(c: Ctx): Promise<boolean> {
  return (await chatModeFor(c.userId)) !== "form";
}

const deleteDraft = (profileId: string) => prisma.onboardingDraft.deleteMany({ where: { profileId } });

async function buildView(c: Ctx, scope: ChatScope, draft: Draft): Promise<ChatView> {
  const mode = await chatModeFor(c.userId);
  const input = completenessInputOf(c.profile);
  const missing = missingItems(input);
  let queue = chatQueue(missing, { stageNameEmpty: !c.profile.stageName?.trim(), skipped: draft.skipped });
  if (scope === "onboarding") queue = queue.filter((f) => ONBOARDING_FIELDS.includes(f));
  const next = queue[0] ?? null;
  const spec = next ? CHAT_FIELDS[next] : null;
  const agentName = (await agentNameFor(c.userId)) ?? "Jay";
  const p = c.profile;
  const names = { first: p.legalFirstName ?? "", last: p.legalLastName ?? "" };
  return {
    mode,
    agentName,
    question: spec && next ? { id: next, kind: spec.kind, options: [...(spec.options ?? [])], optional: !!spec.optional } : null,
    pending: draft.pending ? { field: draft.pending.field, text: formatForReview(draft.pending.field, draft.pending.value) } : null,
    cities: draft.cities,
    skipped: draft.skipped,
    leftForForm: scope === "profile" ? leftForForm(missing, draft.skipped) : [],
    photosMissing: missing.includes("photos"),
    done: queue.length === 0 && !draft.pending,
    review: draft.review,
    snapshot: {
      legalFirstName: names.first,
      legalLastName: names.last,
      stageName: p.stageName ?? "",
      birthDate: p.birthDate ? isoDate(p.birthDate) : "",
      gender: p.gender ?? "",
      genderOther: p.genderOther ?? "",
      phone: p.phone ?? "",
      phoneE164: p.phoneE164 ?? "",
    },
  };
}

async function reply(c: Ctx, scope: ChatScope, draft: Draft, r: Partial<ChatReply> & { status: ChatStatus }): Promise<ChatReply> {
  // Re-read the profile so the next question follows what is now saved.
  const again = (await ctx()) ?? c;
  return { reaction: null, reactionKey: null, error: null, ...r, view: await buildView(again, scope, draft) };
}

const REACTION_KEYS = ["a", "b", "c", "d"];
const pickReaction = (i: number) => `reactions.${REACTION_KEYS[i % REACTION_KEYS.length]}`;

/** Save one validated answer through the form's own action. */
async function persist(c: Ctx, v: Extract<ReturnType<typeof validateAnswer>, { ok: true }>): Promise<SaveResult> {
  switch (v.save) {
    case "identity": return saveProfileIdentity(v.data);
    case "physical": return saveProfilePhysical(v.data);
    case "dayRate": return saveDayRate(v.data);
    case "preferences": {
      // savePreferences stores the WHOLE form: current preferences, one value merged in.
      const current = readPreferences(c.profile.preferences, c.profile.specialties.map((s) => s.kind));
      return savePreferences(mergePreferencesPatch(current, v.data));
    }
  }
}

export async function chatState(scope: ChatScope): Promise<ChatView | null> {
  const c = await ctx();
  if (!c) return null;
  return buildView(c, scope, readDraft(c.profile.onboardingDraft));
}

/** Search our GeoNames table for what the performer typed; the performer picks. */
async function cityChoices(text: string) {
  const q = text.replace(/^\s*(?:i live in|i'm in|i am in|in)\s+/i, "").split(",")[0].trim().slice(0, 60);
  if (q.length < 2) return [];
  const rows = await prisma.geoCity.findMany({
    where: { OR: [{ name: { startsWith: q, mode: "insensitive" } }, { asciiName: { startsWith: q, mode: "insensitive" } }] },
    orderBy: { population: "desc" },
    take: 5,
  });
  return rows.map((r) => ({ geonameId: r.geonameId, label: [r.name, r.admin1Code, r.countryCode].filter(Boolean).join(", ") }));
}

/**
 * One performer turn. kind "chip": the value(s) tapped. "text": typed or spoken
 * text. "skip": leave this question for the form. The field must be the one
 * the server would ask next.
 */
export async function chatTurn(input: { scope: ChatScope; field: string; kind: "chip" | "text" | "skip"; answer?: string | string[] }): Promise<ChatReply | { status: "error"; error: ReturnType<typeof err> }> {
  const c = await ctx();
  if (!c) return { status: "error", error: err("errors.unauthorized") };
  const scope = input.scope === "profile" ? "profile" : "onboarding";
  const draft = readDraft(c.profile.onboardingDraft);
  const view = await buildView(c, scope, draft);
  const field = view.question?.id;
  if (view.mode === "form" || !field || field !== input.field) return { status: "error", error: err("errors.generic") };
  const spec = CHAT_FIELDS[field];
  const step = Object.keys(draft.tries).length + draft.skipped.length;

  if (input.kind === "skip") {
    draft.skipped = [...new Set([...draft.skipped, field])];
    draft.pending = null;
    draft.cities = [];
    await writeDraft(c.profile.id, draft);
    return reply(c, scope, draft, { status: "skipped", reactionKey: "reactions.skipped" });
  }

  const fail = async (key: ErrorKey | null): Promise<ChatReply> => {
    draft.tries[field] = (draft.tries[field] ?? 0) + 1;
    const giveUp = draft.tries[field] >= MAX_TRIES;
    await writeDraft(c.profile.id, draft);
    return reply(c, scope, draft, { status: giveUp ? "fallback" : "retry", reactionKey: giveUp ? "reactions.fallback" : "reactions.retry", error: key ? err(key) : null });
  };

  const commit = async (value: unknown, reaction: string | null): Promise<ChatReply> => {
    const v = validateAnswer(field, value);
    if (!v.ok) {
      if (v.error === "errors.adultsOnly") {
        // Minors: the form's own message, nothing saved, no transcript kept.
        await deleteDraft(c.profile.id);
        return reply(c, scope, emptyDraft(), { status: "minor", error: err("errors.adultsOnly") });
      }
      return fail(v.error);
    }
    const res = await persist(c, v);
    if (!res.ok) return fail((res.error?.key as ErrorKey | undefined) ?? "errors.generic");
    draft.pending = null;
    draft.cities = [];
    delete draft.tries[field];
    await writeDraft(c.profile.id, draft);
    return reply(c, scope, draft, { status: "saved", reaction, reactionKey: reaction ? null : pickReaction(step) });
  };

  if (input.kind === "chip") {
    const list = Array.isArray(input.answer) ? input.answer : [String(input.answer ?? "")];
    if (spec.kind === "text") return { status: "error", error: err("errors.generic") };
    return commit(field === "workTypes" ? { projectTypes: list, roleTypes: [] } : list[0], null);
  }

  // Typed or spoken text.
  const text = String(Array.isArray(input.answer) ? input.answer[0] : (input.answer ?? "")).trim();
  if (!text || text.length > ANSWER_MAX) return fail(null);
  if (spec.kind !== "text") {
    // A typed answer to a chip question: read by rules only.
    const v = parseByRules(field, text);
    return v === null ? fail(null) : commit(field === "workTypes" ? { projectTypes: [v], roleTypes: [] } : v, null);
  }
  if (field === "city") {
    const cities = await cityChoices(text);
    if (cities.length === 0) return fail("errors.cityUnknown");
    draft.cities = cities;
    await writeDraft(c.profile.id, draft);
    return reply(c, scope, draft, { status: "cities" });
  }

  // The model reads free text (never the bio), when it is on and under its cap.
  if (view.mode === "model" && spec.modelReads && !(await accountCapReached(c.userId))) {
    try {
      const r = await askTurn({ userId: c.userId, field, answer: text, lang: "en" });
      if (r.unclear || r.value === null) return fail(null);
      const v = validateAnswer(field, r.value);
      if (!v.ok) return v.error === "errors.adultsOnly" ? commit(r.value, null) : fail(v.error);
      // The model's reading waits for a yes before it is saved.
      draft.pending = { field, value: r.value };
      await writeDraft(c.profile.id, draft);
      return reply(c, scope, draft, { status: "confirm", reaction: r.reaction, reactionKey: r.reaction ? null : pickReaction(step) });
    } catch {
      // Any model error, timeout, refusal or invalid output: the rules take over.
    }
  }
  const value = parseByRules(field, text);
  if (value === null) return fail(null);
  return commit(value, null);
}

/** Yes or no to a model-read value waiting for confirmation. */
export async function confirmPending(accept: boolean, scope: ChatScope): Promise<ChatReply | { status: "error"; error: ReturnType<typeof err> }> {
  const c = await ctx();
  if (!c) return { status: "error", error: err("errors.unauthorized") };
  if (!(await chatAllowed(c))) return { status: "error", error: err("errors.generic") };
  const s = scope === "profile" ? "profile" : "onboarding";
  const draft = readDraft(c.profile.onboardingDraft);
  const p = draft.pending;
  if (!p) return { status: "error", error: err("errors.generic") };
  draft.pending = null;
  if (!accept) {
    await writeDraft(c.profile.id, draft);
    return reply(c, s, draft, { status: "retry", reactionKey: "reactions.retry" });
  }
  const v = validateAnswer(p.field, p.value);
  if (!v.ok) {
    await writeDraft(c.profile.id, draft);
    return reply(c, s, draft, { status: "retry", reactionKey: "reactions.retry", error: err(v.error) });
  }
  const res = await persist(c, v);
  await writeDraft(c.profile.id, draft);
  if (!res.ok) return reply(c, s, draft, { status: "retry", reactionKey: "reactions.retry", error: res.error ?? err("errors.generic") });
  return reply(c, s, draft, { status: "saved", reactionKey: pickReaction(draft.skipped.length) });
}

/** The performer picked one of the listed cities. */
export async function pickCity(geonameId: number, scope: ChatScope): Promise<ChatReply | { status: "error"; error: ReturnType<typeof err> }> {
  const c = await ctx();
  if (!c) return { status: "error", error: err("errors.unauthorized") };
  if (!(await chatAllowed(c))) return { status: "error", error: err("errors.generic") };
  const s = scope === "profile" ? "profile" : "onboarding";
  const draft = readDraft(c.profile.onboardingDraft);
  if (!draft.cities.some((x) => x.geonameId === geonameId)) return { status: "error", error: err("errors.generic") };
  const v = validateAnswer("city", geonameId);
  if (!v.ok) return { status: "error", error: err(v.error) };
  const res = await persist(c, v);
  draft.cities = [];
  await writeDraft(c.profile.id, draft);
  if (!res.ok) return { status: "error", error: res.error ?? err("errors.generic") };
  return reply(c, s, draft, { status: "saved", reactionKey: pickReaction(draft.skipped.length + 1) });
}

/**
 * "Tell us about yourself in one go": one model call on a typed, pasted or
 * spoken text. Nothing is saved: the proposals wait in the draft for review.
 */
export async function extractOneGo(text: string): Promise<{ ok: true; view: ChatView } | { ok: false; error: ReturnType<typeof err> }> {
  const c = await ctx();
  if (!c) return { ok: false, error: err("errors.unauthorized") };
  const trimmed = String(text ?? "").trim();
  if (!trimmed || trimmed.length > ONE_GO_MAX) return { ok: false, error: err("errors.invalidInput") };
  const draft = readDraft(c.profile.onboardingDraft);
  const mode = await chatModeFor(c.userId);
  if (mode !== "model" || (await accountCapReached(c.userId))) return { ok: false, error: err("errors.generic") };
  try {
    const values = await askOneGo({ userId: c.userId, text: trimmed, lang: "en" });
    const rows: { field: ChatFieldId; text: string }[] = [];
    let cities: { geonameId: number; label: string }[] = [];
    for (const f of ONE_GO_FIELDS) {
      const v = (onlyAskedField(f, values) as Record<string, unknown>)[f];
      if (v === undefined) continue;
      if (f === "city") {
        cities = await cityChoices(String(v));
        if (cities[0]) rows.push({ field: "city", text: String(cities[0].geonameId) });
        continue;
      }
      if (f === "legalName" || f === "stageName" || f === "gender" || f === "phone" || f === "birthDate" || validateAnswer(f, v).ok) rows.push({ field: f, text: formatForReview(f, v) });
    }
    draft.review = { rows, cities };
    await writeDraft(c.profile.id, draft, trimmed);
    return { ok: true, view: await buildView(c, "profile", draft) };
  } catch {
    return { ok: false, error: err("errors.generic") };
  }
}

/** Save the reviewed values, each through its form action. All valid or nothing saved. */
export async function saveReview(rows: { field: string; text: string }[]): Promise<{ ok: true } | { ok: false; error: ReturnType<typeof err>; field?: string }> {
  const c = await ctx();
  if (!c) return { ok: false, error: err("errors.unauthorized") };
  if (!(await chatAllowed(c))) return { ok: false, error: err("errors.generic") };
  // Only rows the one-go extraction proposed and the performer reviewed.
  const proposed = new Set(readDraft(c.profile.onboardingDraft).review?.rows.map((r) => r.field) ?? []);
  if (proposed.size === 0) return { ok: false, error: err("errors.generic") };
  if (!Array.isArray(rows)) return { ok: false, error: err("errors.invalidInput") };
  const checked: { field: ChatFieldId; v: Extract<ReturnType<typeof validateAnswer>, { ok: true }> }[] = [];
  for (const r of rows) {
    if (!(ONE_GO_FIELDS as readonly string[]).includes(r.field)) continue; // an unmapped key is dropped
    const field = r.field as ChatFieldId;
    if (!proposed.has(field)) continue;
    if (typeof r.text !== "string" || !r.text.trim() || r.text.length > ANSWER_MAX) continue;
    const value = CHAT_FIELDS[field].kind === "chips" ? r.text.trim() : valueFromReviewText(field, r.text);
    const v = validateAnswer(field, value);
    if (!v.ok) {
      if (v.error === "errors.adultsOnly") await deleteDraft(c.profile.id);
      return { ok: false, error: err(v.error), field };
    }
    checked.push({ field, v });
  }
  for (const { v } of checked) {
    const fresh = (await ctx()) ?? c;
    const res = await persist(fresh, v);
    if (!res.ok) return { ok: false, error: res.error ?? err("errors.generic") };
  }
  await deleteDraft(c.profile.id);
  return { ok: true };
}

export async function discardDraft(): Promise<{ ok: boolean }> {
  const c = await ctx();
  if (!c) return { ok: false };
  await deleteDraft(c.profile.id);
  return { ok: true };
}
