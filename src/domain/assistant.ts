import { z } from "zod";
import type { MissingItem, ProfileGap } from "./completeness";
import type { Preferences } from "./preferences";

/**
 * The Agental assistant in Messages: what a performer can ask about, what the
 * assistant is allowed to know, and the rule-based answers it gives when no
 * model is switched on (or the model fails).
 *
 * Privacy rule: the context below is a whitelist. It never holds the private
 * content boundaries, contact details (email, phone, address), or links to
 * media. Anything not listed here cannot reach a model.
 */

export const MESSAGE_TOPICS = ["profile", "application", "other"] as const;
export const MessageTopic = z.enum(MESSAGE_TOPICS);
export type MessageTopic = z.infer<typeof MessageTopic>;

export type PlanKey = "FREE" | "PRO" | "PREMIUM" | "ULTIMATE";

export interface AssistantApplication {
  title: string;
  /** CandidatureStatus, e.g. NEW, SHORTLISTED. */
  status: string;
  appliedAt: string; // yyyy-mm-dd
}

/** Everything the assistant may know, per topic. Built on the server only. */
export interface AssistantContext {
  topic: MessageTopic;
  locale: string;
  /** Stage name, for a greeting. Never the legal name. */
  name: string;
  plan: PlanKey;
  /** Present for "profile". */
  profile?: {
    completeness: number;
    missing: (MissingItem | ProfileGap)[];
    specialties: string[];
    preferences: Preferences;
    hasImdbLink: boolean;
    hasPortfolioLink: boolean;
  };
  /** Present for "application". */
  applications?: {
    items: AssistantApplication[];
    searchesInProgress: number;
  };
  /**
   * Round 9: the agent the performer set up (name and the help they chose:
   * roles | profile | selftape | draft). Null name: "Agental assistant".
   */
  agent?: { name: string | null; helps: string[] };
  /** Round 9: the AI role searches (every topic). */
  searches?: { limit: number; used: number; remaining: number; inProgress: number; resetInDays: number | null };
  /** Round 9: roles the agents found for the performer, newest first (titles and statuses only). */
  rolesFound?: { project: string; role: string | null; status: string }[];
}

/**
 * Round 9: the app pages the assistant may link to, by name. Paths only, no
 * host: the reply shows them as written and the performer is already signed in.
 */
export const ASSISTANT_PAGES = {
  dashboard: "/talents/app",
  profile: "/talents/app/profil",
  applications: "/talents/app/candidatures",
  reelSelfTape: "/talents/app/reel-self-tape",
  website: "/talents/app/site",
  subscription: "/talents/app/abonnement",
  settings: "/talents/app/parametres",
  messages: "/talents/app/messages",
} as const;

export interface AssistantAnswer {
  text: string;
  /** The assistant is not confident or a person must answer: hand off. */
  handoff: boolean;
  /** "model" or "rules", for the team and the logs. */
  source: "model" | "rules";
}

/** The strings the rule-based answers are made of, in the performer's language. */
export interface AssistantStrings {
  greeting: (name: string) => string;
  profileStatus: (percent: number, next: string | null) => string;
  profileComplete: string;
  missing: (key: MissingItem | ProfileGap) => string;
  noApplications: string;
  applicationsIntro: (count: number) => string;
  applicationLine: (title: string, status: string) => string;
  searches: (count: number) => string;
  plan: (planName: string) => string;
  handoff: string;
}

// Words that say what the person is after, in the four site languages.
const ASKS_PROFILE = /\b(complet|complete|missing|manque|falta|next|prochain|siguiente|percent|%|profil|profile|perfil|photo|bio|ready|prêt|listo|improve|améliorer|mejorar)\w*|完善|资料|缺少/i;
const ASKS_STATUS = /\b(status|statut|estado|where|où|donde|dónde|applications?|candidatures?|candidaturas?|update|nouvelles|news|search|recherche|búsqueda)\w*|状态|申请|搜索/i;
const ASKS_WHY = /\b(why|pourquoi|por qué|porque|reject|refus|rechaz|negotiat|négoci|negoci|contract|contrat|contrato|pay|paie|pago|fee|cachet|legal|lawyer|avocat|abogado)\w*|为什么|合同|拒绝/i;
// Round 9: someone asking for a person is always handed to the team.
const ASKS_HUMAN = /\b(human|a person|real person|someone real|humain|une personne|quelqu'un|una persona|alguien real)\b|真人|人工/i;
const ASKS_PLAN = /\b(plan|formule|price|prix|precio|subscription|abonnement|suscripción|upgrade|pro|basic|premium|ultimate)\b|方案|价格|订阅/i;

/**
 * Answer without a model. It states only facts from the context, and hands
 * off whenever the question goes beyond them: a short honest answer and a
 * person to follow, rather than a guess.
 */
export function answerByRules(
  question: string,
  ctx: AssistantContext,
  s: AssistantStrings,
  planName: string
): AssistantAnswer {
  const q = question.toLowerCase();
  const parts: string[] = [s.greeting(ctx.name)];
  let handoff = false;

  if (ctx.topic === "profile" && ctx.profile) {
    const p = ctx.profile;
    parts.push(
      p.completeness >= 100
        ? s.profileComplete
        : s.profileStatus(p.completeness, p.missing[0] ? s.missing(p.missing[0]) : null)
    );
    if (!ASKS_PROFILE.test(q) || ASKS_WHY.test(q)) handoff = true;
  } else if (ctx.topic === "application" && ctx.applications) {
    const a = ctx.applications;
    if (a.items.length === 0) parts.push(s.noApplications);
    else {
      parts.push(s.applicationsIntro(a.items.length));
      for (const item of a.items.slice(0, 5)) parts.push(s.applicationLine(item.title, item.status));
    }
    if (a.searchesInProgress > 0) parts.push(s.searches(a.searchesInProgress));
    if (!ASKS_STATUS.test(q) || ASKS_WHY.test(q)) handoff = true;
  } else {
    if (ASKS_PLAN.test(q) && !ASKS_WHY.test(q)) parts.push(s.plan(planName));
    else handoff = true;
  }

  if (ASKS_HUMAN.test(q)) handoff = true;
  if (handoff) parts.push(s.handoff);
  return { text: parts.join("\n"), handoff, source: "rules" };
}

/** Keys that must never appear in what is sent to a model. Checked in tests. */
export const FORBIDDEN_CONTEXT_KEYS = [
  "email",
  "phone",
  "legalName",
  "birthDate",
  "city",
  "contentBoundaries",
  "nudity",
  "storageKey",
  "url",
  "mediaUrl",
  "avatarKey",
  "studentEmail",
] as const;
