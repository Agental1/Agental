import { prisma } from "@/lib/db";
import { emailSenderConfigured, sendEmail, type MailerEnv } from "@/lib/mailer";
import { limelightConfirmationEmail } from "@/lib/email-templates";
import { siteBaseUrl } from "@/lib/email-tokens";

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
export const MAX_ATTEMPTS = 5;
/** A "sending" row this old was left by a process that stopped. */
const STALE_MS = 10 * 60 * 1000;

export async function drainConfirmations(
  opts: { env?: MailerEnv; now?: Date; limit?: number; send?: typeof sendEmail } = {}
): Promise<{ sent: number; failed: number; configured: boolean }> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendEmail;
  if (!emailSenderConfigured(env)) return { sent: 0, failed: 0, configured: false };
  // A row left "sending" by a crash goes back in the queue.
  await prisma.limelightLead.updateMany({
    where: { confirmation: "sending", confirmationSentAt: { lt: new Date(now.getTime() - STALE_MS) } },
    data: { confirmation: "pending", confirmationSentAt: null },
  });
  const rows = await prisma.limelightLead.findMany({
    where: { confirmation: "pending" },
    orderBy: { firstSeenAt: "asc" },
    take: opts.limit ?? 10,
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
      where: { id: r.id, confirmation: "pending", confirmationAttempts: r.confirmationAttempts },
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
      await prisma.limelightLead.update({ where: { id: r.id }, data: { confirmation: last ? "failed" : "pending", confirmationSentAt: null } });
      failed += 1;
    }
  }
  return { sent, failed, configured: true };
}
