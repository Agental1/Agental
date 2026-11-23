import { prisma } from "@/lib/db";
import { emailSenderConfigured, sendEmail, type MailerEnv } from "@/lib/mailer";
import { limelightConfirmationEmail } from "@/lib/email-templates";
import { siteBaseUrl } from "@/lib/email-tokens";
import { isPaused } from "@/lib/app-settings";

/**
 * Round 9, group 2: "We received your Limelight request", to the person who
 * asked for a portfolio site, with their reference. Separate from the team
 * alert (./outbox.ts), which is unchanged.
 *
 * Each lead is claimed (pending -> sending) before its email goes out, so two
 * drains never send it twice; a failure puts it back to pending until
 * MAX_ATTEMPTS, then "failed". Requests made before round 9 are "before_r9"
 * and never get a late confirmation. Without an email sender nothing is
 * claimed. Runs right after a request (best effort) and from the daily cron.
 */
export const MAX_ATTEMPTS = 6;
/** A failed try waits this long before the next, so an outage of a few hours uses one or two tries, not all. */
export const RETRY_GAP_MS = 6 * 60 * 60 * 1000;
/** At most this many confirmations a day: the form is public, so a cap bounds any abuse. */
export const DAILY_CAP = 100;
/** A "sending" row this old was left by a process that stopped. */
const STALE_MS = 10 * 60 * 1000;

export async function drainConfirmations(
  opts: { env?: MailerEnv; now?: Date; limit?: number; send?: typeof sendEmail } = {}
): Promise<{ sent: number; failed: number; configured: boolean }> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendEmail;
  if (!emailSenderConfigured(env)) return { sent: 0, failed: 0, configured: false };
  // Round 9: the pause switch holds the confirmations; they go out after Resume.
  if (await isPaused()) return { sent: 0, failed: 0, configured: true };
  // A row left "sending" by a crash: the email may have gone out, so a row
  // that used its tries is closed, and the rest go back in the queue.
  const stale = { confirmation: "sending", confirmationSentAt: { lt: new Date(now.getTime() - STALE_MS) } };
  await prisma.limelightLead.updateMany({ where: { ...stale, confirmationAttempts: { gte: MAX_ATTEMPTS } }, data: { confirmation: "failed" } });
  await prisma.limelightLead.updateMany({ where: stale, data: { confirmation: "pending", confirmationSentAt: null } });
  const today = await prisma.limelightLead.count({
    where: { confirmation: { in: ["sent", "sending"] }, confirmationSentAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });
  const room = Math.max(0, DAILY_CAP - today);
  if (room === 0) return { sent: 0, failed: 0, configured: true };
  const rows = await prisma.limelightLead.findMany({
    // Never tried (no date), or the last failed try is older than the gap.
    where: { confirmation: "pending", OR: [{ confirmationSentAt: null }, { confirmationSentAt: { lt: new Date(now.getTime() - RETRY_GAP_MS) } }] },
    orderBy: { firstSeenAt: "asc" },
    take: Math.min(opts.limit ?? 10, room),
    select: { id: true, email: true, locale: true, reference: true, confirmationAttempts: true },
  });
  let base = "https://www.agental.co";
  try {
    base = siteBaseUrl(env);
  } catch {
    // The cron has no request host: the public site.
  }
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    const claimed = await prisma.limelightLead.updateMany({
      where: { id: r.id, confirmation: "pending", confirmationAttempts: { equals: r.confirmationAttempts, lt: MAX_ATTEMPTS } },
      // While "sending", confirmationSentAt holds the claim time (stale check above).
      data: { confirmation: "sending", confirmationAttempts: r.confirmationAttempts + 1, confirmationSentAt: now },
    });
    if (claimed.count !== 1) continue;
    let ok = false;
    try {
      const res = await send(
        {
          to: r.email,
          kind: "limelight_confirmation",
          ...limelightConfirmationEmail(r.locale, r.reference, `${base}/${r.locale}/talents/limelight`),
        },
        { env }
      );
      ok = res.ok && res.mode === "resend";
    } catch {
      ok = false;
    }
    if (ok) {
      await prisma.limelightLead.update({ where: { id: r.id }, data: { confirmation: "sent", confirmationSentAt: now } });
      sent += 1;
    } else {
      const last = r.confirmationAttempts + 1 >= MAX_ATTEMPTS;
      // While "pending", confirmationSentAt is the last failed try (for the gap).
      await prisma.limelightLead.update({ where: { id: r.id }, data: { confirmation: last ? "failed" : "pending", confirmationSentAt: now } });
      failed += 1;
    }
  }
  return { sent, failed, configured: true };
}
