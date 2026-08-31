import { describe, expect, it } from "vitest";
import { z } from "zod";
import { err, zodError } from "@/domain/action-result";

/**
 * Server actions return a translation KEY, never a sentence: they run on the
 * server and render on the client, so a ready-made sentence freezes the
 * language at execution time. These cover the conversion, including the case
 * the review found — a key that looks right but does not exist.
 */
describe("err", () => {
  it("omits values when there are none, so equality stays simple", () => {
    expect(err("errors.generic")).toEqual({ key: "errors.generic" });
  });

  it("carries ICU arguments for interpolated messages", () => {
    expect(err("errors.quotaExceeded", { plan: "PRO", limit: 10 })).toEqual({
      key: "errors.quotaExceeded",
      values: { plan: "PRO", limit: 10 },
    });
  });
});

describe("zodError", () => {
  function failureOf(schema: z.ZodType, input: unknown): z.ZodError {
    const parsed = schema.safeParse(input);
    if (parsed.success) throw new Error("expected the schema to reject this input");
    return parsed.error;
  }

  it("passes a real key straight through", () => {
    const schema = z.string().min(2, "errors.stageNameRequired");
    expect(zodError(failureOf(schema, "x"))).toEqual({
      key: "errors.stageNameRequired",
    });
  });

  it("falls back for a built-in Zod message, which has no key", () => {
    // No custom message: Zod supplies its own English string. Showing that
    // verbatim to a French or Spanish user is the hole this closes.
    const schema = z.coerce.number().int().min(40).max(260);
    expect(zodError(failureOf(schema, 5))).toEqual({ key: "errors.invalidInput" });
  });

  it("falls back for a key-shaped message that does not exist", () => {
    // The regression the review caught: a prefix test alone would accept this
    // typo, cast it, then miss at translation time and degrade to "typoKey"
    // in front of a user. Membership in the real key set is what rejects it.
    const schema = z.string().min(2, "errors.stagNameRequired");
    expect(zodError(failureOf(schema, "x"))).toEqual({ key: "errors.invalidInput" });
  });

  it("falls back for a plain French sentence left in a schema", () => {
    const schema = z.string().min(2, "Ton nom artistique est requis.");
    expect(zodError(failureOf(schema, "x"))).toEqual({ key: "errors.invalidInput" });
  });
});
