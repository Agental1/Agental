import { describe, expect, it } from "vitest";
import {
  createModelBudget,
  HARD_MAX_BRIEFS_PER_REQUEST,
  LIMIT_SPECS,
  limitsWith,
  MAX_BODY_BYTES,
  resolveLimits,
  SIGNATURE_TOLERANCE_SECONDS,
  type WorkflowLimits,
} from "@/domain/workflow/limits";

/**
 * The limits and the model budget: defaults, what an environment variable
 * may move, and that a cap refuses the call that would cross it.
 */

describe("resolveLimits", () => {
  it("gives the defaults when nothing is set", () => {
    expect(resolveLimits({})).toEqual({
      maxBriefsPerRequest: 50,
      maxProfilesPerRun: 10,
      maxModelCallsPerRun: 25,
      maxRetriesPerItem: 1,
      modelTimeoutMs: 20_000,
      maxCostPerRunMicroUsd: 1_000_000,
      maxCostPerDayMicroUsd: 5_000_000,
      maxRunAttempts: 3,
      maxRequestsPerHour: 120,
    });
    expect(resolveLimits()).toEqual(resolveLimits({}));
  });

  it("reads an override", () => {
    const limits = resolveLimits({
      WORKFLOW_MAX_MODEL_CALLS_PER_RUN: "5",
      WORKFLOW_MAX_COST_PER_RUN_MICROUSD: " 250000 ",
      WORKFLOW_MAX_BRIEFS_PER_REQUEST: "10",
    });
    expect(limits.maxModelCallsPerRun).toBe(5);
    expect(limits.maxCostPerRunMicroUsd).toBe(250_000);
    expect(limits.maxBriefsPerRequest).toBe(10);
  });

  it("clamps an override to the hard ceiling", () => {
    const limits = resolveLimits({
      WORKFLOW_MAX_BRIEFS_PER_REQUEST: "5000",
      WORKFLOW_MAX_MODEL_CALLS_PER_RUN: "100000",
      WORKFLOW_MAX_RETRIES_PER_ITEM: "99",
      WORKFLOW_MODEL_TIMEOUT_MS: "3600000",
      WORKFLOW_MAX_COST_PER_RUN_MICROUSD: "999999999999",
      WORKFLOW_MAX_COST_PER_DAY_MICROUSD: "999999999999",
      WORKFLOW_MAX_RUN_ATTEMPTS: "50",
    });
    expect(limits.maxBriefsPerRequest).toBe(50);
    expect(limits.maxModelCallsPerRun).toBe(200);
    expect(limits.maxRetriesPerItem).toBe(3);
    expect(limits.modelTimeoutMs).toBe(60_000);
    expect(limits.maxCostPerRunMicroUsd).toBe(10_000_000);
    expect(limits.maxCostPerDayMicroUsd).toBe(50_000_000);
    expect(limits.maxRunAttempts).toBe(5);
  });

  it("clamps an override to the floor", () => {
    const limits = resolveLimits({
      WORKFLOW_MAX_BRIEFS_PER_REQUEST: "0",
      WORKFLOW_MODEL_TIMEOUT_MS: "1",
      WORKFLOW_MAX_RUN_ATTEMPTS: "0",
    });
    expect(limits.maxBriefsPerRequest).toBe(1);
    expect(limits.modelTimeoutMs).toBe(1_000);
    expect(limits.maxRunAttempts).toBe(1);
  });

  it("allows the model caps to be set to zero", () => {
    const limits = resolveLimits({
      WORKFLOW_MAX_MODEL_CALLS_PER_RUN: "0",
      WORKFLOW_MAX_COST_PER_RUN_MICROUSD: "0",
    });
    expect(limits.maxModelCallsPerRun).toBe(0);
    expect(limits.maxCostPerRunMicroUsd).toBe(0);
  });

  it("falls back to the default for anything that is not a plain number", () => {
    for (const value of ["", "  ", "ten", "-5", "1e9", "12.5", "0x10", "5 briefs"]) {
      expect(resolveLimits({ WORKFLOW_MAX_MODEL_CALLS_PER_RUN: value }).maxModelCallsPerRun).toBe(25);
    }
  });

  it("keeps every default inside its own floor and ceiling", () => {
    for (const spec of Object.values(LIMIT_SPECS)) {
      expect(spec.fallback).toBeGreaterThanOrEqual(spec.min);
      expect(spec.fallback).toBeLessThanOrEqual(spec.ceiling);
      expect(spec.env).toMatch(/^WORKFLOW_[A-Z_]+$/);
    }
  });

  it("fixes the request ceilings", () => {
    expect(HARD_MAX_BRIEFS_PER_REQUEST).toBe(50);
    expect(MAX_BODY_BYTES).toBe(262_144);
    expect(SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });
});

describe("limitsWith", () => {
  it("applies the same floors and ceilings to explicit numbers", () => {
    const limits = limitsWith({
      maxModelCallsPerRun: 1_000_000,
      modelTimeoutMs: 5,
      maxRetriesPerItem: 2.9,
      maxCostPerRunMicroUsd: Number.NaN,
    });
    expect(limits.maxModelCallsPerRun).toBe(200);
    expect(limits.modelTimeoutMs).toBe(1_000);
    expect(limits.maxRetriesPerItem).toBe(2);
    expect(limits.maxCostPerRunMicroUsd).toBe(1_000_000);
    expect(limitsWith()).toEqual(resolveLimits({}));
  });
});

describe("createModelBudget", () => {
  const caps = (over: Partial<WorkflowLimits> = {}) => ({
    maxModelCallsPerRun: 3,
    maxCostPerRunMicroUsd: 1_000,
    maxCostPerDayMicroUsd: 5_000,
    ...over,
  });

  it("allows calls and counts them with their cost", () => {
    const budget = createModelBudget(caps());
    expect(budget.check(100)).toEqual({ ok: true });
    budget.record(80);
    budget.record(20.2);
    expect(budget.modelCalls).toBe(2);
    expect(budget.costMicroUsd).toBe(101);
    expect(budget.limitsHit).toEqual([]);
  });

  it("refuses once the calls of the run are used up", () => {
    const budget = createModelBudget(caps());
    for (let i = 0; i < 3; i++) {
      expect(budget.check(1).ok).toBe(true);
      budget.record(1);
    }
    expect(budget.check(1)).toEqual({ ok: false, reason: "model_calls_per_run" });
  });

  it("refuses the call whose worst case would cross the run's spend cap", () => {
    const budget = createModelBudget(caps());
    budget.record(700);
    expect(budget.check(300)).toEqual({ ok: true });
    expect(budget.check(301)).toEqual({ ok: false, reason: "cost_per_run" });
    // The cap was never crossed: nothing was spent by the refused call.
    expect(budget.costMicroUsd).toBe(700);
  });

  it("counts what other runs spent today against the daily cap", () => {
    const budget = createModelBudget(caps(), { spentTodayMicroUsd: 4_600 });
    expect(budget.check(400)).toEqual({ ok: true });
    expect(budget.check(401)).toEqual({ ok: false, reason: "cost_per_day" });
    budget.record(400);
    expect(budget.check(1)).toEqual({ ok: false, reason: "cost_per_day" });
  });

  it("starts from what an earlier attempt of the same run already used", () => {
    const budget = createModelBudget(caps(), { priorModelCalls: 2, priorCostMicroUsd: 900 });
    expect(budget.modelCalls).toBe(2);
    expect(budget.costMicroUsd).toBe(900);
    expect(budget.check(101)).toEqual({ ok: false, reason: "cost_per_run" });
    expect(budget.check(100)).toEqual({ ok: true });
    budget.record(100);
    expect(budget.check(0)).toEqual({ ok: false, reason: "model_calls_per_run" });
  });

  it("refuses every call when a cap is zero", () => {
    expect(createModelBudget(caps({ maxModelCallsPerRun: 0 })).check(0).ok).toBe(false);
    expect(createModelBudget(caps({ maxCostPerRunMicroUsd: 0 })).check(1)).toEqual({
      ok: false,
      reason: "cost_per_run",
    });
  });

  it("lists each limit met once, in the order met", () => {
    const budget = createModelBudget(caps({ maxCostPerDayMicroUsd: 500 }));
    budget.check(2_000);
    budget.check(2_000);
    budget.check(600);
    budget.record(1);
    budget.record(1);
    budget.record(1);
    budget.check(1);
    expect(budget.limitsHit).toEqual(["cost_per_run", "cost_per_day", "model_calls_per_run"]);
  });

  it("treats a cost that is not a positive number as zero", () => {
    const budget = createModelBudget(caps());
    budget.record(Number.NaN);
    budget.record(-50);
    expect(budget.costMicroUsd).toBe(0);
    expect(budget.modelCalls).toBe(2);
  });
});
