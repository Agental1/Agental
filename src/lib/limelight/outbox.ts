import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  emailSenderConfigured,
  sendEmail,
  type EmailMessage,
  type MailerEnv,
  type SendEmailResult,
} from "@/lib/mailer";
import { LIMELIGHT_REFERENCE_PATTERN } from "@/domain/limelight";

/**
 * Transactional outbox, sending side.
 *
 * A message row is written in the same transaction as the record it
 * announces (see ./leads.ts), so an alert exists exactly when its lead does.
 * `drainOutbox` delivers the rows that are due. It runs after a lead is
 * stored (best effort) and from the cron route, and it is safe to run from
 * both at the same moment.
 *
 * Delivery is at least once. A row is claimed before it is sent, so two
 * drains never send the same alert together; if a process dies between the
 * send and the write that records it, the alert goes out again once the
 * claim lapses.
 */

/** The alert to the team that a portfolio site was requested. */
export const LEAD_ALERT_KIND = "limelight.lead.alert";

/** One alert per lead: the outbox's unique `dedupeKey`. */
export function leadAlertDedupeKey(leadId: string): string {
  return `${LEAD_ALERT_KIND}:${leadId}`;
}

/** Where the owner reads leads. The alert email points here and nowhere else. */
export const LIMELIGHT_OWNER_VIEW_PATH = "/admin/limelight";

/** How long a claimed row is left alone before another drain may retry it. */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_ERROR_LENGTH = 200;

/**
 * The wait before the next try, after `attempts` failed ones: 5 minutes,
 * then 10, 20, 40 and so on, capped at 6 hours.
 */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  return Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
}

/**
 * An error as it may be stored in `lastError`: its class and message with
 * every email address, URL and long token-like run replaced, cut to 200
 * characters. The outbox table is read by people; a provider's answer can
 * repeat a recipient or a key.
 */
export function redactError(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const cleaned = message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/\S+@\S+/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned ? `${name}: ${cleaned}` : name).slice(0, MAX_ERROR_LENGTH);
}

export type OutboxDb = Pick<PrismaClient, "outboxMessage">;

export interface DrainOptions {
  /** Rows handled in one call. Default 10, at most 100. */
  limit?: number;
  /** Defaults to the current time. Tests pin it. */
  now?: Date;
  /** Defaults to the shared client. */
  db?: OutboxDb;
  /** Defaults to process.env. */
  env?: MailerEnv;
  /** Defaults to `sendEmail`. */
  send?: (message: EmailMessage, deps: { env: MailerEnv }) => Promise<SendEmailResult>;
}

/** Counts only: this is also what the cron route answers. */
export interface DrainResult {
  /** False when the email sender or the alert address is missing. */
  configured: boolean;
  /** Rows that were due when the drain looked. */
  due: number;
  sent: number;
  /** Failed and scheduled for another try. */
  retried: number;
  /** Out of attempts. They stay in the table and show in the lead list. */
  dead: number;
  /** Due, and left untouched: another drain held them. */
  skipped: number;
}

/** `LIMELIGHT_ALERT_EMAIL`, or null when it is unset or not an address. */
export function alertRecipient(env: MailerEnv = process.env): string | null {
  const value = (env.LIMELIGHT_ALERT_EMAIL ?? "").trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value) ? value : null;
}

/**
 * The alert. It carries the request reference and the path of the owner
 * view, and nothing about the person: no name, no email address, no link
 * they sent. Mail is the least private hop on the way to the team.
 */
export function leadAlertEmail(reference: string, to: string): EmailMessage {
  const path = `${LIMELIGHT_OWNER_VIEW_PATH}?ref=${encodeURIComponent(reference)}`;
  const lines = [
    "A new portfolio site request was received.",
    "",
    `Reference: ${reference}`,
    `Owner view: ${path}`,
    "",
    "Sign in to the site with an admin account and open that path to read the request.",
    "This message carries no personal details on purpose.",
  ];
  return {
    to,
    subject: `Limelight request ${reference}`,
    text: lines.join("\n"),
    html: [
      "<p>A new portfolio site request was received.</p>",
      `<p>Reference: <strong>${reference}</strong><br>Owner view: <code>${path.replace(/&/g, "&amp;")}</code></p>`,
      "<p>Sign in to the site with an admin account and open that path to read the request. This message carries no personal details on purpose.</p>",
    ].join("\n"),
  };
}

/** The reference in a lead alert's payload, or null when the row is unusable. */
function referenceFrom(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    const reference =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { reference?: unknown }).reference
        : null;
    return typeof reference === "string" && LIMELIGHT_REFERENCE_PATTERN.test(reference)
      ? reference
      : null;
  } catch {
    return null;
  }
}

/**
 * Send the lead alerts that are due.
 *
 * A row is due when it is PENDING and its `nextAttemptAt` has passed. For
 * each one, in order of `nextAttemptAt`:
 *
 * 1. Claim it: one conditional write that adds 1 to `attempts` and moves
 *    `nextAttemptAt` five minutes ahead, valid only while the row is exactly
 *    as it was read. Of two drains that read the same row, one write matches
 *    and the other matches nothing and skips the row.
 * 2. Send the email to `LIMELIGHT_ALERT_EMAIL`.
 * 3. Record the outcome: SENT with `sentAt`; or a wait that doubles from
 *    five minutes with a redacted `lastError`; or DEAD once `attempts`
 *    reached `maxAttempts`.
 *
 * When the email sender (RESEND_API_KEY and EMAIL_FROM) or the alert address
 * is missing, nothing is claimed: rows stay PENDING with their attempts
 * untouched, and the answer says `configured: false`. A missing key delays
 * an alert and never uses it up.
 *
 * A row found PENDING with no attempt left was claimed for its last try by a
 * process that then stopped. It is marked DEAD without another send.
 */
export async function drainOutbox(opts: DrainOptions = {}): Promise<DrainResult> {
  const db = opts.db ?? prisma;
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendEmail;
  const wanted = opts.limit ?? DEFAULT_LIMIT;
  const take = Number.isInteger(wanted)
    ? Math.min(Math.max(wanted, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const result: DrainResult = {
    configured: true,
    due: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    skipped: 0,
  };
  const dueWhere = {
    kind: LEAD_ALERT_KIND,
    status: "PENDING",
    nextAttemptAt: { lte: now },
  };

  const to = alertRecipient(env);
  if (!to || !emailSenderConfigured(env)) {
    result.configured = false;
    result.due = await db.outboxMessage.count({ where: dueWhere });
    if (result.due > 0) {
      console.warn(
        "[limelight] outbox not drained: set RESEND_API_KEY, EMAIL_FROM and LIMELIGHT_ALERT_EMAIL. Waiting:",
        result.due
      );
    }
    return result;
  }

  const rows = await db.outboxMessage.findMany({
    where: dueWhere,
    orderBy: { nextAttemptAt: "asc" },
    take,
  });
  result.due = rows.length;

  for (const row of rows) {
    // The row exactly as read. A write with this condition matches nothing
    // once another drain has touched the row.
    const asRead = {
      id: row.id,
      status: "PENDING",
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt,
    };

    if (row.attempts >= row.maxAttempts) {
      const { count } = await db.outboxMessage.updateMany({
        where: asRead,
        data: { status: "DEAD", lastError: row.lastError ?? "No attempt left." },
      });
      if (count === 1) result.dead++;
      else result.skipped++;
      continue;
    }

    const attempts = row.attempts + 1;
    const claimed = await db.outboxMessage.updateMany({
      where: asRead,
      data: { attempts, nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (claimed.count !== 1) {
      result.skipped++;
      continue;
    }

    const reference = referenceFrom(row.payload);
    let failure: string | null = null;
    let released = false;
    if (!reference) {
      failure = "Unreadable payload.";
    } else {
      try {
        const sent = await send({ ...leadAlertEmail(reference, to), kind: "limelight_alert" }, { env });
        if (!sent.ok) failure = "The email provider refused the message or could not be reached.";
        // Log mode means the sender went missing after the check above.
        // Nothing left the server, so the try is handed back.
        else if (sent.mode !== "resend") released = true;
      } catch (error) {
        failure = redactError(error);
      }
    }

    if (released) {
      await db.outboxMessage.update({
        where: { id: row.id },
        data: { attempts: row.attempts, nextAttemptAt: row.nextAttemptAt },
      });
      result.skipped++;
    } else if (failure === null) {
      await db.outboxMessage.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: now, lastError: null },
      });
      result.sent++;
    } else if (!reference || attempts >= row.maxAttempts) {
      // A payload that cannot be read will not improve with another try.
      await db.outboxMessage.update({
        where: { id: row.id },
        data: { status: "DEAD", lastError: failure },
      });
      result.dead++;
      console.error("[limelight] alert given up, outbox row:", row.id);
    } else {
      await db.outboxMessage.update({
        where: { id: row.id },
        data: {
          nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
          lastError: failure,
        },
      });
      result.retried++;
    }
  }

  return result;
}
