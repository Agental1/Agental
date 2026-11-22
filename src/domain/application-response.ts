import { z } from "zod";

/**
 * Answering a role from Applications (round 7b, 4.2). A role may ask for
 * answers to questions and for videos; the performer accepts the role, fills
 * a response (a text per question, a clip per requested video, recorded there
 * or picked from Reel & Self-tape), then submits it for the Agental team's
 * review. Nothing goes to a casting site in this round.
 */
export const MAX_QUESTIONS = 10;
export const MAX_VIDEOS = 5;
export const ANSWER_MAX = 2000;

export const Submission = z.object({
  questions: z.array(z.string().trim().min(1).max(500)).max(MAX_QUESTIONS).catch([]),
  videos: z.array(z.string().trim().min(1).max(200)).max(MAX_VIDEOS).catch([]),
});
export type Submission = z.infer<typeof Submission>;

/** The stored JSON, read safely: anything unexpected asks for nothing. */
export function readSubmission(raw: string | null | undefined): Submission {
  try {
    const parsed = Submission.safeParse(JSON.parse(raw || "{}"));
    return parsed.success ? parsed.data : { questions: [], videos: [] };
  } catch {
    return { questions: [], videos: [] };
  }
}

export function readAnswers(raw: string | null | undefined, count: number): string[] {
  let list: unknown = [];
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    list = [];
  }
  const arr = Array.isArray(list) ? list : [];
  return Array.from({ length: count }, (_, i) => (typeof arr[i] === "string" ? arr[i] : ""));
}

export const Answers = z.array(z.string().max(ANSWER_MAX));

/** Statuses in which the performer may still change the response. */
export const EDITABLE_STATUSES = ["DRAFT", "NEEDS_INFO", "ACCEPTED"] as const;

export type MissingPart = { kind: "question" | "video"; index: number };

/** What still blocks "Submit": an empty answer or a video slot with no clip. */
export function missingParts(s: Submission, answers: string[], filledSlots: number[]): MissingPart[] {
  const out: MissingPart[] = [];
  s.questions.forEach((_, i) => {
    if (!(answers[i] ?? "").trim()) out.push({ kind: "question", index: i });
  });
  s.videos.forEach((_, i) => {
    if (!filledSlots.includes(i)) out.push({ kind: "video", index: i });
  });
  return out;
}
