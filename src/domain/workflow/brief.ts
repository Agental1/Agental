import { z } from "zod";
import { SpecialtyKind } from "@/domain/enums";
import { HARD_MAX_BRIEFS_PER_REQUEST } from "./limits";
import { cleanBlock, cleanLine } from "./text";

/**
 * An opportunity brief as a performer sees it, and the request that carries
 * briefs into the dry-run workflow.
 *
 * Unrelated to the casting-side project brief (src/app/actions/brief.ts):
 * that one is written by a producer inside the app. This one arrives from
 * outside, so every string is untrusted data. It is length-capped as
 * received (an over-long field is refused, never cut, so no requirement is
 * dropped silently), cleaned of control and invisible characters, and never
 * placed inside an instruction.
 */

export const BRIEF_STATUSES = ["ACTIVE", "EXPIRED", "WITHDRAWN"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

/** Sources accepted with no configuration. Others come from WORKFLOW_ALLOWED_SOURCES. */
export const BUILT_IN_SOURCES = ["manual", "fixture"] as const;

const SOURCE_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** A source name as the allowlist and the request spell it. */
export function isSourceName(value: string): boolean {
  return SOURCE_NAME.test(value);
}

/**
 * The sources this deployment accepts: the built-in ones plus the names in
 * WORKFLOW_ALLOWED_SOURCES (comma-separated). A malformed name is ignored.
 */
export function allowedSources(raw: string | undefined): string[] {
  const extra = (raw ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(isSourceName);
  return [...new Set([...BUILT_IN_SOURCES, ...extra])];
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** "yyyy-mm-dd" as midnight UTC. Null for anything else, 2026-02-30 included. */
export function parseDay(value: string): Date | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * A closing time. A full timestamp must carry its offset ("Z" or "+02:00"),
 * so the server's time zone never decides. A bare day means the end of that
 * day in UTC: a brief that closes "on the 1st" is open through the 1st.
 */
export function parseInstant(value: string): Date | null {
  const day = parseDay(value);
  if (day) return new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (!ISO_INSTANT.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const Day = z
  .string()
  .max(10)
  .refine((value) => parseDay(value) !== null);

const Instant = z
  .string()
  .max(40)
  .refine((value) => parseInstant(value) !== null);

/* ── Text fields ───────────────────────────────────────────────────────── */

/** A required one-line field, cleaned, with something left after cleaning. */
const requiredLine = (max: number) =>
  z
    .string()
    .max(max)
    .transform(cleanLine)
    .refine((value) => value.length > 0);

/** An optional one-line field. Empty after cleaning counts as absent. */
const optionalLine = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const cleaned = value ? cleanLine(value) : "";
      return cleaned.length > 0 ? cleaned : null;
    });

/** A short list of one-line labels: cleaned, empties and repeats removed. */
const labelList = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().max(maxLength))
    .max(maxItems)
    .transform((items) => [
      ...new Set(items.map(cleanLine).filter((item) => item.length > 0)),
    ]);

const optionalLabel = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => {
      const cleaned = cleanLine(value);
      return cleaned.length > 0 ? cleaned : undefined;
    });

const Country = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());

/* ── Requirements ──────────────────────────────────────────────────────── */

/**
 * Requirements a brief may state about protected traits, or about an image
 * or a voice. They are stored so the performer can read them. Rules and
 * models leave them unassessed: each one becomes a question for the human.
 */
export const PROTECTED_REQUIREMENTS = [
  "playingAge",
  "gender",
  "ethnicity",
  "disability",
  "appearance",
  "voice",
] as const;
export type ProtectedRequirement = (typeof PROTECTED_REQUIREMENTS)[number];

/** The `Brief.requirements` JSON column. */
export const BriefRequirements = z.strictObject({
  /** Languages the role needs, as the source names them. */
  languages: labelList(10, 40).optional(),
  /** Skills the role needs, as the source names them. */
  skills: labelList(20, 60).optional(),
  /** The role involves nudity. */
  nudity: z.boolean().optional(),
  /** The role involves working with animals. */
  animals: z.boolean().optional(),
  /** Countries where the right to work is required (ISO 3166-1 alpha-2). */
  workAuthorization: z
    .array(Country)
    .max(10)
    .transform((items) => [...new Set(items)])
    .optional(),
  /** Anything else the source lists, one requirement per entry. */
  other: labelList(10, 200).optional(),
  playingAge: optionalLabel(60).optional(),
  gender: optionalLabel(60).optional(),
  ethnicity: optionalLabel(120).optional(),
  disability: optionalLabel(120).optional(),
  appearance: optionalLabel(300).optional(),
  voice: optionalLabel(300).optional(),
});
export type BriefRequirements = z.infer<typeof BriefRequirements>;

/** Read the stored JSON column. Unreadable content counts as no requirement. */
export function parseRequirements(raw: string | null | undefined): BriefRequirements {
  try {
    const parsed = BriefRequirements.safeParse(JSON.parse(raw ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/* ── One brief, as received ────────────────────────────────────────────── */

export const BriefInput = z
  .strictObject({
    /** The source's own identifier for this brief, when it has one. */
    sourceRef: optionalLine(200),
    title: requiredLine(200),
    production: optionalLine(200),
    roleName: optionalLine(200),
    /** One of the app's specialty kinds, when the source says so. */
    roleType: SpecialtyKind.nullish().transform((value) => value ?? null),
    description: z
      .string()
      .max(5000)
      .nullish()
      .transform((value) => (value ? cleanBlock(value) : "")),
    location: optionalLine(200),
    /** ISO 3166-1 alpha-2. */
    country: Country.nullish().transform((value) => value ?? null),
    remote: z
      .boolean()
      .nullish()
      .transform((value) => value ?? null),
    /** "yyyy-mm-dd". */
    startsOn: Day.nullish().transform((value) => value ?? null),
    /** "yyyy-mm-dd", on or after startsOn. */
    endsOn: Day.nullish().transform((value) => value ?? null),
    paid: z
      .boolean()
      .nullish()
      .transform((value) => value ?? null),
    rateCents: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .nullish()
      .transform((value) => value ?? null),
    unionStatus: optionalLine(60),
    requirements: BriefRequirements.nullish().transform((value) => value ?? {}),
    /** "yyyy-mm-dd" or a timestamp with its offset. */
    expiresAt: Instant.nullish().transform((value) => value ?? null),
  })
  .superRefine((brief, ctx) => {
    if (brief.startsOn && brief.endsOn && brief.endsOn < brief.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "before startsOn" });
    }
  });
export type BriefInput = z.infer<typeof BriefInput>;

/**
 * Which fields of a refused brief were wrong: paths only, never the values,
 * so an answer or a log line cannot echo untrusted text.
 */
export function issuePaths(error: z.ZodError): string[] {
  const paths = error.issues.map((issue) =>
    issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)"
  );
  return [...new Set(paths)].slice(0, 12);
}

/* ── The intake request ────────────────────────────────────────────────── */

/**
 * The body of POST /api/workflow/briefs. Briefs are validated one by one
 * afterwards, so one malformed brief is reported as invalid and the others
 * are still taken in.
 */
export const IntakeBody = z.strictObject({
  source: z.string().regex(SOURCE_NAME),
  briefs: z.array(z.unknown()).min(1).max(HARD_MAX_BRIEFS_PER_REQUEST),
  /** Narrows the run to these pilot profiles. It can never widen it. */
  profileIds: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
    .min(1)
    .max(100)
    .optional(),
});
export type IntakeBody = z.infer<typeof IntakeBody>;

/* ── One brief, normalized ─────────────────────────────────────────────── */

/** A brief ready to be stored and assessed. Mirrors the Brief columns. */
export interface NormalizedBrief {
  source: string;
  sourceRef: string | null;
  dedupeKey: string;
  title: string;
  production: string | null;
  roleName: string | null;
  roleType: string | null;
  description: string;
  location: string | null;
  country: string | null;
  remote: boolean | null;
  startsOn: Date | null;
  endsOn: Date | null;
  paid: boolean | null;
  rateCents: number | null;
  unionStatus: string | null;
  requirements: BriefRequirements;
  expiresAt: Date | null;
  status: BriefStatus;
}
