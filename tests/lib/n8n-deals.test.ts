import { describe, expect, it } from "vitest";
import { actorRef, dealsForActor } from "@/lib/n8n/deals";

const ref = actorRef("profile_1", "secret");

describe("actorRef", () => {
  it("is stable and does not contain the profile id", () => {
    expect(actorRef("profile_1", "secret")).toBe(ref);
    expect(ref).not.toContain("profile_1");
    expect(actorRef("profile_2", "secret")).not.toBe(ref);
  });
});

describe("dealsForActor", () => {
  const payload = {
    deals: [
      { task_id: 1, task: "Commercial, 2 days", terms: "$1,200", actor_ref: ref, deal_doc_url: "https://docs.google.com/x" },
      { task_id: 2, task: "Someone else's deal", actor_ref: actorRef("profile_2", "secret") },
      { task_id: 3, task: "Untagged deal" },
      { task_id: 4, task: "Bad link", actor_ref: ref, deal_doc_url: "javascript:alert(1)" },
    ],
  };

  it("keeps only this actor's deals and drops untagged ones", () => {
    expect(dealsForActor(payload, ref)?.map((d) => d.taskId)).toEqual(["1", "4"]);
  });

  it("keeps only https deal links", () => {
    const deals = dealsForActor(payload, ref)!;
    expect(deals[0].dealDocUrl).toBe("https://docs.google.com/x");
    expect(deals[1].dealDocUrl).toBeNull();
  });

  it("rejects a malformed response", () => {
    expect(dealsForActor({ nope: true }, ref)).toBeNull();
  });
});
