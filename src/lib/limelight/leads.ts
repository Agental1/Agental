import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hitRateLimit } from "@/lib/rate-limit";
import {
  parseLimelightInterest,
  type LimelightFieldErrors,
  type LimelightInterest,
  type LimelightLeadStatus,
} from "@/domain/limelight";
import { LEAD_ALERT_KIND, leadAlertDedupeKey } from "./outbox";
import { limelightKeyHash } from "./request";

/**
 * "Request a portfolio site": the one place a lead is stored.
 *
 * The route (`POST /api/limelight/interest`) and both server actions call
 * `recordInterest`. A lead is answered as received only once its row is
 * committed, and the alert to the team is an outbox row written in the same
 * transaction: either both exist or neither does. Nothing here calls n8n,
 * and no email is sent on this path (see ./outbox.ts; the confirmation to the
 * person is sent after the response too, see ./confirmation.ts).
 *
 * This is a plain module, not a "use server" file. `recordInterest` is safe
 * to call for anyone; the two functions below it return personal data and
 * check nobody, so their callers check for an admin first.
 */

/**
 * SWITCH for the three inquiry columns on LimelightLead:
 *
 *   need        String?                    (TEXT, nullable)
 *   contactPref String  @default("email")  (TEXT, NOT NULL, default 'email')
 *   phone       String?                    (TEXT, nullable)
 *
 * While this is false, `need`, `contactPref` and `phone` are validated and
 * then NOT stored: `recordInterest` says so in its answer
 * (`detailsStored: false`) and logs one line with the lead id.
 *
 * Set it to true once BOTH are done: the columns exist in the database (the
 * migration is applied) and the generated Prisma client knows the three
 * fields (`prisma generate` ran on the schema that has them). Nothing else
 * changes: the writes below are already in place, and the reads already
 * return the columns when a row has them. Turning it on earlier makes every
 * lead write fail, because Prisma refuses a field its client does not know.
 */
export const LEAD_DETAIL_COLUMNS: boolean = true;

/** The three inquiry columns, as a row may or may not carry them. */
interface LeadDetailColumns {
  need?: string | null;
  contactPref?: string | null;
  phone?: string | null;
}

/**
 * A lead row read for its inquiry columns. Through `object` on purpose: the
 * row's generated type has none of the three before the migration and all of
 * them after, and this reads either.
 */
function detailsOf(row: object): LeadDetailColumns {
  return row as LeadDetailColumns;
}

/** True when the request says more than the columns that exist can hold. */
function hasDetails(input: LimelightInterest): boolean {
  return Boolean(input.need) || input.contactPref === "call" || Boolean(input.phone);
}

/**
 * What a new lead stores in the inquiry columns. Typed as a bare object:
 * the generated client learns these fields only with the migration, and
 * this compiles on both sides of it.
 */
function detailsForCreate(input: LimelightInterest, on: boolean): object {
  if (!on) return {};
  return {
    need: input.need ?? null,
    contactPref: input.contactPref,
    phone: input.phone ?? null,
  } satisfies LeadDetailColumns;
}

/**
 * What a repeat adds to the inquiry columns. Same rule as the other optional
 * fields: only what was empty is filled. A repeat that asks for a call, on a
 * lead that has no phone number yet, records the number and the preference
 * together; a number on file is never replaced.
 */
function detailsForRepeat(
  existing: LeadDetailColumns,
  input: LimelightInterest,
  on: boolean
): object {
  if (!on) return {};
  const fill: LeadDetailColumns = {};
  if (!existing.need && input.need) fill.need = input.need;
  if (!existing.phone && input.contactPref === "call" && input.phone) {
    fill.contactPref = "call";
    fill.phone = input.phone;
  }
  return fill;
}

export type LeadDb = Pick<
  PrismaClient,
  "$transaction" | "rateLimitEvent" | "limelightLead" | "outboxMessage"
>;

export interface InterestContext {
  /**
   * The caller's address as a keyed hash (`clientAddressKey`), never the
   * address. Without it the per-address limit is skipped.
   */
  clientKey?: string | null;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
  /** Defaults to the shared client. Tests hand in a mock. */
  db?: LeadDb;
  /** Defaults to `LEAD_DETAIL_COLUMNS`. Tests exercise both sides. */
  detailColumns?: boolean;
}

export type InterestResult =
  | {
      ok: true;
      reference: string;
      /** True when this call created the lead. False for a repeat. */
      created: boolean;
      /** False for a honeypot submission: nothing was written. */
      stored: boolean;
      /**
       * False when the request carried `need`, a call preference or a phone
       * number and the columns for them do not exist yet
       * (`LEAD_DETAIL_COLUMNS`). The lead itself is stored either way.
       */
      detailsStored: boolean;
    }
  | { ok: false; reason: "invalid"; fieldErrors: LimelightFieldErrors }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number }
  | { ok: false; reason: "failed" };

/** Requests per client address. The same numbers as the form this replaces. */
export const INTEREST_PER_ADDRESS = { limit: 5, windowMs: 10 * 60 * 1000 };
/** Requests per email address, whoever sends them. */
export const INTEREST_PER_EMAIL = { limit: 5, windowMs: 60 * 60 * 1000 };

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * "LL-" and eight Crockford base32 characters: 40 random bits, short enough
 * to read out on the phone. It names a request, it opens nothing: no page or
 * route shows a lead to someone who holds only its reference.
 */
export function newLeadReference(): string {
  let out = "";
  // 256 is a multiple of 32, so the low five bits of a random byte are an
  // unbiased pick among the 32 characters.
  for (const byte of randomBytes(8)) out += CROCKFORD[byte & 31];
  return `LL-${out}`;
}

/** The hidden `company` field. People never see it; scripts fill it. */
function honeypotFilled(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const value = (raw as Record<string, unknown>).company;
  if (value == null || value === false) return false;
  return typeof value === "string" ? value.trim().length > 0 : true;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Safe to log: the error's class and Prisma code, never its message. */
function errorLabel(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown error";
  const { name, code } = error as { name?: unknown; code?: unknown };
  return [typeof name === "string" ? name : "Error", typeof code === "string" ? code : ""]
    .filter(Boolean)
    .join(" ");
}

/** How many times the write is tried when a unique index refuses it. */
const STORE_ATTEMPTS = 4;

/**
 * Validate and store one request.
 *
 * In order: the honeypot (answers a made-up reference, writes nothing, not
 * even a rate limit event), validation, the two rate limits, then the write.
 * Invalid input costs no database work and does not count toward a limit.
 *
 * One row per email address. A repeat answers the reference issued the first
 * time, adds one to `submissions`, moves `lastSeenAt`, fills `performerType`
 * and `portfolioUrl` if they were empty, and turns `marketingOptIn` on when
 * it is explicitly true (it is never turned off here). It writes no outbox
 * row, so the team gets one alert per person. Name, source, locale, consent
 * version and status stay as first recorded.
 *
 * Never throws: a database failure is `{ ok: false, reason: "failed" }` and
 * one log line with the error class.
 */
export async function recordInterest(
  raw: unknown,
  ctx: InterestContext = {}
): Promise<InterestResult> {
  if (honeypotFilled(raw)) {
    return {
      ok: true,
      reference: newLeadReference(),
      created: false,
      stored: false,
      detailsStored: false,
    };
  }

  const parsed = parseLimelightInterest(raw);
  if (!parsed.ok) {
    return { ok: false, reason: "invalid", fieldErrors: parsed.fieldErrors };
  }
  const input = parsed.data;
  const db = ctx.db ?? prisma;
  const now = ctx.now ?? new Date();
  const detailColumns = ctx.detailColumns ?? LEAD_DETAIL_COLUMNS;

  try {
    if (ctx.clientKey) {
      const byAddress = await hitRateLimit(db, `limelight:interest:addr:${ctx.clientKey}`, {
        ...INTEREST_PER_ADDRESS,
        now,
      });
      if (!byAddress.allowed) {
        return { ok: false, reason: "rate_limited", retryAfterMs: byAddress.retryAfterMs };
      }
    }
    const byEmail = await hitRateLimit(
      db,
      `limelight:interest:email:${limelightKeyHash("email", input.email)}`,
      { ...INTEREST_PER_EMAIL, now }
    );
    if (!byEmail.allowed) {
      return { ok: false, reason: "rate_limited", retryAfterMs: byEmail.retryAfterMs };
    }

    for (let attempt = 1; ; attempt++) {
      try {
        const stored = await db.$transaction(async (tx) => {
          // The whole row, with no `select`: the inquiry columns come back
          // once they exist, without this query naming them.
          const existing = await tx.limelightLead.findUnique({
            where: { email: input.email },
          });

          if (existing) {
            await tx.limelightLead.update({
              where: { id: existing.id },
              data: {
                submissions: { increment: 1 },
                lastSeenAt: now,
                ...(existing.performerType === null && input.performerType
                  ? { performerType: input.performerType }
                  : {}),
                ...(existing.portfolioUrl === null && input.portfolioUrl
                  ? { portfolioUrl: input.portfolioUrl }
                  : {}),
                ...(input.marketingOptIn === true && !existing.marketingOptIn
                  ? { marketingOptIn: true }
                  : {}),
                ...detailsForRepeat(detailsOf(existing), input, detailColumns),
              },
            });
            return { id: existing.id, reference: existing.reference, created: false };
          }

          const lead = await tx.limelightLead.create({
            data: {
              reference: newLeadReference(),
              email: input.email,
              name: input.name,
              performerType: input.performerType ?? null,
              portfolioUrl: input.portfolioUrl ?? null,
              source: input.source,
              consentVersion: input.consentVersion,
              marketingOptIn: input.marketingOptIn,
              locale: input.locale,
              status: "NEW",
              submissions: 1,
              firstSeenAt: now,
              lastSeenAt: now,
              ...detailsForCreate(input, detailColumns),
            },
            select: { id: true, reference: true },
          });
          // Record references only: the alert email is built from these and
          // carries nothing else.
          await tx.outboxMessage.create({
            data: {
              kind: LEAD_ALERT_KIND,
              dedupeKey: leadAlertDedupeKey(lead.id),
              payload: JSON.stringify({ leadId: lead.id, reference: lead.reference }),
              status: "PENDING",
              nextAttemptAt: now,
              createdAt: now,
            },
          });
          return { id: lead.id, reference: lead.reference, created: true };
        });

        if (stored.created) console.info("[limelight] lead stored:", stored.id);
        const detailsStored = detailColumns || !hasDetails(input);
        if (!detailsStored) {
          // Said out loud, with the lead id and nothing personal: the
          // request asked for more than the table can hold today.
          console.warn(
            "[limelight] need, contactPref and phone not stored (columns pending), lead:",
            stored.id
          );
        }
        return {
          ok: true,
          reference: stored.reference,
          created: stored.created,
          stored: true,
          detailsStored,
        };
      } catch (error) {
        // Two requests for the same new email at the same moment: the unique
        // index on the email refused one, and the next pass finds the row the
        // other wrote. The same code covers a reference that was already
        // taken: the next pass draws a new one.
        if (!isUniqueViolation(error) || attempt >= STORE_ATTEMPTS) throw error;
      }
    }
  } catch (error) {
    console.error("[limelight] lead not stored:", errorLabel(error));
    return { ok: false, reason: "failed" };
  }
}

// --------------------------------------------------------------- owner view

export interface LimelightLeadView {
  id: string;
  reference: string;
  name: string;
  email: string;
  performerType: string | null;
  portfolioUrl: string | null;
  source: string;
  consentVersion: string;
  marketingOptIn: boolean;
  locale: string;
  status: string;
  submissions: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** What they need, in their words. Null when not given, and until the column exists. */
  need: string | null;
  /** "email" or "call". "email" until the column exists. */
  contactPref: string;
  /** Only for a lead that asked for a call. Null until the column exists. */
  phone: string | null;
  /** Where the alert to the team stands. Null when the lead has none. */
  alert: "PENDING" | "SENT" | "DEAD" | null;
}

export const LEADS_DEFAULT_LIMIT = 200;
export const LEADS_MAX_LIMIT = 5000;

function alertStatus(value: string | undefined): LimelightLeadView["alert"] {
  return value === "PENDING" || value === "SENT" || value === "DEAD" ? value : null;
}

/**
 * Leads for the owner view, newest first. Carries names and email addresses
 * and checks nobody: call it only after `currentAdminId()` answered an id.
 */
export async function listLimelightLeads(
  opts: { status?: LimelightLeadStatus; limit?: number } = {},
  db: Pick<PrismaClient, "limelightLead" | "outboxMessage"> = prisma
): Promise<LimelightLeadView[]> {
  const wanted = opts.limit ?? LEADS_DEFAULT_LIMIT;
  const take = Number.isInteger(wanted)
    ? Math.min(Math.max(wanted, 1), LEADS_MAX_LIMIT)
    : LEADS_DEFAULT_LIMIT;

  const leads = await db.limelightLead.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: [{ firstSeenAt: "desc" }, { id: "desc" }],
    take,
  });
  if (leads.length === 0) return [];

  const alerts = await db.outboxMessage.findMany({
    where: { dedupeKey: { in: leads.map((lead) => leadAlertDedupeKey(lead.id)) } },
    select: { dedupeKey: true, status: true },
  });
  const alertByKey = new Map(alerts.map((row) => [row.dedupeKey, row.status]));

  return leads.map((lead) => {
    const details = detailsOf(lead);
    return {
      id: lead.id,
      reference: lead.reference,
      name: lead.name,
      email: lead.email,
      performerType: lead.performerType,
      portfolioUrl: lead.portfolioUrl,
      source: lead.source,
      consentVersion: lead.consentVersion,
      marketingOptIn: lead.marketingOptIn,
      locale: lead.locale,
      status: lead.status,
      submissions: lead.submissions,
      firstSeenAt: lead.firstSeenAt,
      lastSeenAt: lead.lastSeenAt,
      need: details.need ?? null,
      contactPref: details.contactPref ?? "email",
      phone: details.phone ?? null,
      alert: alertStatus(alertByKey.get(leadAlertDedupeKey(lead.id))),
    };
  });
}

/**
 * Move a lead to another status, with its audit entry in the same
 * transaction. Returns the status before and after, or null when no such
 * lead exists. Checks nobody: the `setLeadStatus` action does.
 */
export async function changeLeadStatus(
  leadId: string,
  status: LimelightLeadStatus,
  actorUserId: string,
  db: Pick<PrismaClient, "$transaction"> = prisma
): Promise<{ before: string; after: LimelightLeadStatus } | null> {
  return db.$transaction(async (tx) => {
    const lead = await tx.limelightLead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true },
    });
    if (!lead) return null;
    if (lead.status !== status) {
      await tx.limelightLead.update({ where: { id: lead.id }, data: { status } });
      await tx.auditLog.create({
        data: {
          actorUserId,
          organizationId: null,
          action: "limelight.lead.status",
          resourceType: "LimelightLead",
          resourceId: lead.id,
          before: JSON.stringify({ status: lead.status }),
          after: JSON.stringify({ status }),
        },
      });
    }
    return { before: lead.status, after: status };
  });
}
