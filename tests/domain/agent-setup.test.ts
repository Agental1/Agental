import { describe, expect, it } from "vitest";
import { AgentSetupInput, agentSetupOf } from "@/domain/agent-setup";

describe("AgentSetupInput (round 8b)", () => {
  it("accepts a listed name with at least one help", () => {
    expect(AgentSetupInput.safeParse({ name: "samantha", helps: ["roles"] }).success).toBe(true);
  });
  it("needs a typed name for Custom, spaces alone are refused", () => {
    expect(AgentSetupInput.safeParse({ name: "custom", customName: "   ", helps: ["roles"] }).success).toBe(false);
    const ok = AgentSetupInput.safeParse({ name: "custom", customName: " Nova ", helps: ["draft"] });
    expect(ok.success && ok.data.customName).toBe("Nova");
  });
  it("refuses no help, an unknown help and a name over 40 characters", () => {
    expect(AgentSetupInput.safeParse({ name: "adrian", helps: [] }).success).toBe(false);
    expect(AgentSetupInput.safeParse({ name: "adrian", helps: ["hack"] }).success).toBe(false);
    expect(AgentSetupInput.safeParse({ name: "custom", customName: "x".repeat(41), helps: ["roles"] }).success).toBe(false);
  });
});

describe("agentSetupOf", () => {
  const row = { agentNameChoice: "custom", agentCustomName: "Nova", agentHelps: '["roles","bogus","draft"]', agentSavedAt: new Date() };
  it("reads a saved setup and drops unknown helps", () => {
    expect(agentSetupOf(row)).toEqual({ name: "custom", customName: "Nova", helps: ["roles", "draft"] });
  });
  it("is null before the first save or with an unknown name", () => {
    expect(agentSetupOf({ ...row, agentSavedAt: null })).toBeNull();
    expect(agentSetupOf({ ...row, agentNameChoice: "zed" })).toBeNull();
  });
  it("survives broken JSON in helps", () => {
    expect(agentSetupOf({ ...row, agentHelps: "{" })?.helps).toEqual([]);
  });
});
