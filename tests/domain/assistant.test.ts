import { describe, expect, it } from "vitest";
import { answerByRules, FORBIDDEN_CONTEXT_KEYS, type AssistantContext } from "@/domain/assistant";
import { assistantStrings } from "@/lib/assistant";

const { s } = assistantStrings("en");
const prefs = { projectTypes: [], roleTypes: [], compensation: null, travel: null, workModes: [], animals: null, playableAgeMin: null, playableAgeMax: null };
const base = { locale: "en", name: "Maya", plan: "FREE" as const };

describe("assistant rules", () => {
  it("answers a profile question from the profile, with the next missing item", () => {
    const ctx: AssistantContext = {
      ...base,
      topic: "profile",
      profile: { completeness: 54, missing: ["photos", "video"], specialties: ["ACTOR"], preferences: prefs, hasImdbLink: false, hasPortfolioLink: false },
    };
    const a = answerByRules("What is missing on my profile?", ctx, s, "Basic");
    expect(a.handoff).toBe(false);
    expect(a.text).toContain("54% complete");
    expect(a.text).toContain("add photos");
  });

  it("hands off a profile question it cannot answer", () => {
    const ctx: AssistantContext = {
      ...base,
      topic: "profile",
      profile: { completeness: 100, missing: [], specialties: [], preferences: prefs, hasImdbLink: true, hasPortfolioLink: true },
    };
    const a = answerByRules("Why did the casting team reject me?", ctx, s, "Basic");
    expect(a.handoff).toBe(true);
    expect(a.text).toContain("Agental team");
  });

  it("lists applications with their statuses", () => {
    const ctx: AssistantContext = {
      ...base,
      topic: "application",
      applications: { items: [{ title: "The Lucent Room", status: "SHORTLISTED", appliedAt: "2026-11-10" }], searchesInProgress: 2 },
    };
    const a = answerByRules("What is the status of my applications?", ctx, s, "Basic");
    expect(a.handoff).toBe(false);
    expect(a.text).toContain("The Lucent Room: Shortlisted");
    expect(a.text).toContain("in progress: 2");
  });

  it("hands off anything else, except a plain plan question", () => {
    expect(answerByRules("Can you help with my visa?", { ...base, topic: "other" }, s, "Basic").handoff).toBe(true);
    const plan = answerByRules("Which plan am I on?", { ...base, topic: "other" }, s, "Basic");
    expect(plan.handoff).toBe(false);
    expect(plan.text).toContain("Basic");
  });

  it("knows which keys must never reach a model", () => {
    expect(FORBIDDEN_CONTEXT_KEYS).toEqual(expect.arrayContaining(["email", "phone", "contentBoundaries", "nudity", "url"]));
  });
});
