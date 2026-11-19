import { createHash } from "node:crypto";
import {
  parseDay,
  parseInstant,
  parseRequirements,
  type BriefInput,
  type BriefStatus,
  type NormalizedBrief,
} from "./brief";
import { foldLabel } from "./text";

/**
 * Normalization, the dedupe key and the input hash.
 *
 * Kept apart from the schemas because it needs node:crypto: a client
 * component may import the types in ./brief and ./fit, and must never pull
 * this file in.
 */

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** JSON with object keys sorted, so equal values always give equal text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** UTC calendar day of an instant, "yyyy-mm-dd". Null stays null. */
export function dayOf(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * What makes two briefs the same brief.
 *
 * When the source gives its own identifier, that identifier within that
 * source is the brief. Otherwise the brief is recognized by what it says:
 * title, production, role and start date, compared without case, accents or
 * punctuation. The second form leaves the source out on purpose, so the same
 * casting call relayed by two sources is stored once.
 */
export function dedupeKeyFor(
  source: string,
  brief: {
    sourceRef: string | null;
    title: string;
    production: string | null;
    roleName: string | null;
    startsOn: string | Date | null;
  }
): string {
  if (brief.sourceRef) {
    return sha256Hex(`ref\n${source}\n${brief.sourceRef}`);
  }
  const start =
    brief.startsOn instanceof Date ? dayOf(brief.startsOn) : brief.startsOn;
  return sha256Hex(
    [
      "content",
      foldLabel(brief.title),
      foldLabel(brief.production),
      foldLabel(brief.roleName),
      start ?? "",
    ].join("\n")
  );
}

/** ACTIVE, or EXPIRED once the closing time has passed. */
export function statusAt(expiresAt: Date | null, now: Date): BriefStatus {
  return expiresAt && expiresAt.getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE";
}

/** A validated brief, with its dates as instants, its key and its status. */
export function normalizeBrief(
  source: string,
  input: BriefInput,
  now: Date
): NormalizedBrief {
  const expiresAt = input.expiresAt ? parseInstant(input.expiresAt) : null;
  return {
    source,
    sourceRef: input.sourceRef,
    dedupeKey: dedupeKeyFor(source, input),
    title: input.title,
    production: input.production,
    roleName: input.roleName,
    roleType: input.roleType,
    description: input.description,
    location: input.location,
    country: input.country,
    remote: input.remote,
    startsOn: input.startsOn ? parseDay(input.startsOn) : null,
    endsOn: input.endsOn ? parseDay(input.endsOn) : null,
    paid: input.paid,
    rateCents: input.rateCents,
    unionStatus: input.unionStatus,
    requirements: input.requirements,
    expiresAt,
    status: statusAt(expiresAt, now),
  };
}

/** The columns of a stored Brief that the workflow reads back. */
export interface StoredBrief {
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
  requirements: string;
  expiresAt: Date | null;
  status: string;
}

/** A stored row back in the shape the rules read. */
export function briefFromRow(row: StoredBrief): NormalizedBrief {
  return {
    source: row.source,
    sourceRef: row.sourceRef,
    dedupeKey: row.dedupeKey,
    title: row.title,
    production: row.production,
    roleName: row.roleName,
    roleType: row.roleType,
    description: row.description,
    location: row.location,
    country: row.country,
    remote: row.remote,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    paid: row.paid,
    rateCents: row.rateCents,
    unionStatus: row.unionStatus,
    requirements: parseRequirements(row.requirements),
    expiresAt: row.expiresAt,
    status:
      row.status === "EXPIRED" || row.status === "WITHDRAWN" ? row.status : "ACTIVE",
  };
}
