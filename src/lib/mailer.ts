/**
 * Outgoing email, one message at a time.
 *
 * Two modes, chosen by the environment on every call:
 *
 * - "resend": RESEND_API_KEY and EMAIL_FROM are both set. The message goes to
 *   Resend over its HTTP API, with no SDK.
 * - "log": either one is missing. The message stays on the server and one line
 *   says so. Outside production that line also carries the text body, so a
 *   developer can click the link. In production it carries the subject and the
 *   recipient's domain, and that is all: an address, a token or a link is kept
 *   out of production logs in every code path of this file.
 *
 * The environment and fetch are parameters so both modes are tested with no
 * network.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** For the admin email log: verify, reset, student, deletion_warning, limelight_alert... */
  kind?: string;
  /** Round 9: extra headers (List-Unsubscribe and List-Unsubscribe-Post on automatic emails). */
  headers?: Record<string, string>;
  /** Round 9: a hidden copy (the team keeps a copy of each approved reply). */
  bcc?: string;
  /** Round 9: where answers go (the team address on approved replies). */
  replyTo?: string;
  /** Round 9: Resend's Idempotency-Key, so a retry after a timeout never sends twice. */
  idempotencyKey?: string;
}

/** Writes the admin email log. null turns it off (unit tests). */
export interface EmailRecorder {
  start(message: EmailMessage): Promise<string | null>;
  finish(id: string | null, outcome: { status: "sent" | "logged" | "failed"; resendId?: string | null; error?: string }): Promise<void>;
}

export type SendEmailResult =
  | { ok: true; mode: "resend" | "log" }
  | { ok: false };

export type MailerEnv = Record<string, string | undefined>;

export interface MailerDeps {
  /** Defaults to process.env. */
  env?: MailerEnv;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Defaults to the database log (off under vitest). */
  record?: EmailRecorder | null;
}

/** The EmailLog table. Never throws: a log failure never blocks an email. */
const databaseRecorder: EmailRecorder = {
  async start(message) {
    try {
      const { prisma } = await import("@/lib/db");
      const row = await prisma.emailLog.create({
        data: { to: message.to.slice(0, 320), subject: message.subject.slice(0, 300), kind: (message.kind ?? "other").slice(0, 40) },
        select: { id: true },
      });
      return row.id;
    } catch {
      console.error("[mailer] email log write failed");
      return null;
    }
  },
  async finish(id, outcome) {
    if (!id) return;
    try {
      const { prisma } = await import("@/lib/db");
      await prisma.emailLog.update({
        where: { id },
        data: { status: outcome.status, resendId: outcome.resendId ?? null, error: outcome.error?.slice(0, 200) ?? null },
      });
    } catch {
      // The email itself went (or not) regardless.
      console.error("[mailer] email log update failed");
    }
  },
};

function recorderFor(deps: MailerDeps): EmailRecorder | null {
  if (deps.record !== undefined) return deps.record;
  return process.env.VITEST ? null : databaseRecorder;
}

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const SEND_TIMEOUT_MS = 8000;

function setting(env: MailerEnv, name: string): string {
  return (env[name] ?? "").trim();
}

/** True when a real sender exists: both RESEND_API_KEY and EMAIL_FROM are set. */
export function emailSenderConfigured(env: MailerEnv = process.env): boolean {
  return (
    setting(env, "RESEND_API_KEY").length > 0 &&
    setting(env, "EMAIL_FROM").length > 0
  );
}

/** What follows the last "@". Safe to log, unlike the address itself. */
function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  const domain = at >= 0 ? address.slice(at + 1).trim() : "";
  return domain || "unknown";
}

/**
 * Send one email, or log it when no sender is configured.
 *
 * A refusal from Resend, a timeout or a network failure all answer
 * `{ ok: false }`. The log line then holds the HTTP status or the error name
 * only: Resend's answer can repeat the recipient, so the body is left unread.
 */
export async function sendEmail(
  message: EmailMessage,
  deps: MailerDeps = {}
): Promise<SendEmailResult> {
  const env = deps.env ?? process.env;
  const record = recorderFor(deps);
  // The log never holds an email up: one second at most, then the email goes unlogged.
  const logId = record
    ? await Promise.race([record.start(message), new Promise<null>((r) => setTimeout(() => r(null), 1000))])
    : null;

  if (!emailSenderConfigured(env)) {
    const summary = `[mailer] log mode, nothing sent: subject=${JSON.stringify(
      message.subject
    )} to=*@${domainOf(message.to)}`;
    console.info(
      env.NODE_ENV === "production" ? summary : `${summary}\n${message.text}`
    );
    await record?.finish(logId, { status: "logged" });
    return { ok: true, mode: "log" };
  }

  const send = deps.fetch ?? fetch;
  try {
    const response = await send(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${setting(env, "RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: setting(env, "EMAIL_FROM"),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.headers && Object.keys(message.headers).length ? { headers: message.headers } : {}),
        ...(message.bcc ? { bcc: message.bcc } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[mailer] Resend refused the email, status", response.status);
      await record?.finish(logId, { status: "failed", error: `status ${response.status}` });
      return { ok: false };
    }
    // Only the message id is read from Resend's answer (for the delivery webhook).
    let resendId: string | null = null;
    try {
      const body = (await response.json()) as { id?: unknown };
      resendId = typeof body?.id === "string" ? body.id.slice(0, 100) : null;
    } catch {
      resendId = null;
    }
    await record?.finish(logId, { status: "sent", resendId });
    return { ok: true, mode: "resend" };
  } catch (error) {
    console.error(
      "[mailer] Resend could not be reached:",
      error instanceof Error ? error.name : "unknown error"
    );
    await record?.finish(logId, { status: "failed", error: error instanceof Error ? error.name : "unknown error" });
    return { ok: false };
  }
}
