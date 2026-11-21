import { prisma } from "@/lib/db";
import {
  Decision,
  EvidenceItem,
  parseStoredList,
  parseStoredReasons,
  RuleFailureItem,
  RulePassedItem,
  UnknownItem,
} from "@/domain/workflow/fit";

/**
 * Application drafts as their performer reads them.
 *
 * A draft is a row to look at: a brief, why it was suggested, what is still
 * unknown, and the materials the performer chose to put with it. This file
 * only reads: it submits and sends nothing.
 *
 * Both functions take the profile id of the signed-in performer, which the
 * caller resolves from the session. A draft that belongs to another profile
 * is simply not found.
 */

export type DraftStatus = "DRAFT" | "APPROVED" | "DECLINED" | "NEEDS_INFO";

export interface DraftItem {
  id: string;
  status: DraftStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  brief: {
    id: string;
    title: string;
    production: string | null;
    roleName: string | null;
    location: string | null;
    startsOn: Date | null;
    endsOn: Date | null;
    expiresAt: Date | null;
    /** ACTIVE | EXPIRED | WITHDRAWN */
    status: string;
    source: string;
  };
  /** Null when the assessment the draft pointed at no longer exists. */
  evaluation: {
    decision: Decision;
    reasons: string[];
    unknowns: UnknownItem[];
    rulesPassed: RulePassedItem[];
    ruleFailures: RuleFailureItem[];
    profileEvidence: EvidenceItem[];
    briefEvidence: EvidenceItem[];
    ruleVersion: string;
    /** Null when the rules decided alone. */
    modelVersion: string | null;
  } | null;
  media: Array<{ id: string; type: string; title: string | null }>;
}

const MAX_LISTED = 200;

const draftSelect = {
  id: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  brief: {
    select: {
      id: true,
      title: true,
      production: true,
      roleName: true,
      location: true,
      startsOn: true,
      endsOn: true,
      expiresAt: true,
      status: true,
      source: true,
    },
  },
  evaluation: {
    select: {
      decision: true,
      reasons: true,
      unknowns: true,
      rulesPassed: true,
      ruleFailures: true,
      profileEvidence: true,
      briefEvidence: true,
      ruleVersion: true,
      modelVersion: true,
    },
  },
  media: {
    orderBy: { createdAt: "asc" as const },
    select: { media: { select: { id: true, type: true, title: true } } },
  },
};

interface DraftRow {
  id: string;
  status: string;
  createdAt: Date;
  reviewedAt: Date | null;
  brief: DraftItem["brief"];
  evaluation: {
    decision: string;
    reasons: string;
    unknowns: string;
    rulesPassed: string;
    ruleFailures: string;
    profileEvidence: string;
    briefEvidence: string;
    ruleVersion: string;
    modelVersion: string | null;
  } | null;
  media: Array<{ media: { id: string; type: string; title: string | null } }>;
}

const STATUSES: readonly string[] = ["DRAFT", "APPROVED", "DECLINED", "NEEDS_INFO"];

function toItem(row: DraftRow): DraftItem {
  const decision = row.evaluation ? Decision.safeParse(row.evaluation.decision) : null;
  return {
    id: row.id,
    status: STATUSES.includes(row.status) ? (row.status as DraftStatus) : "DRAFT",
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    brief: row.brief,
    evaluation: row.evaluation
      ? {
          // A stored value nobody can read is shown as the cautious one.
          decision: decision?.success ? decision.data : "needs_review",
          reasons: parseStoredReasons(row.evaluation.reasons),
          unknowns: parseStoredList(UnknownItem, row.evaluation.unknowns),
          rulesPassed: parseStoredList(RulePassedItem, row.evaluation.rulesPassed),
          ruleFailures: parseStoredList(RuleFailureItem, row.evaluation.ruleFailures),
          profileEvidence: parseStoredList(EvidenceItem, row.evaluation.profileEvidence),
          briefEvidence: parseStoredList(EvidenceItem, row.evaluation.briefEvidence),
          ruleVersion: row.evaluation.ruleVersion,
          modelVersion: row.evaluation.modelVersion,
        }
      : null,
    media: row.media.map((link) => link.media),
  };
}

/** The performer's drafts, newest first. */
export async function listMyDrafts(profileId: string): Promise<DraftItem[]> {
  if (!profileId) return [];
  const rows = await prisma.applicationDraft.findMany({
    where: { profileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_LISTED,
    select: draftSelect,
  });
  return rows.map(toItem);
}

/** One draft of the performer, or null. Another performer's draft is null too. */
export async function getMyDraft(
  profileId: string,
  draftId: string
): Promise<DraftItem | null> {
  if (!profileId || !draftId) return null;
  const row = await prisma.applicationDraft.findFirst({
    where: { id: draftId, profileId },
    select: draftSelect,
  });
  return row ? toItem(row) : null;
}
