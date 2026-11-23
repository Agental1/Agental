import enApp from "../../messages/en/app.json";
import frApp from "../../messages/fr/app.json";
import esApp from "../../messages/es/app.json";
import zhApp from "../../messages/zh/app.json";
import { prisma } from "@/lib/db";
import { emailSenderConfigured, sendEmail, type MailerEnv } from "@/lib/mailer";
import { brandedEmail } from "@/lib/email-branded";
import { unsubscribeUrls, type EmailCategory } from "@/lib/email-unsubscribe";
import { siteBaseUrl } from "@/lib/email-tokens";
import { toLocale, type Locale } from "@/i18n/routing";
import { workflowMode } from "@/domain/workflow/eligibility";
import { approvedEmailCategories, isPaused } from "@/lib/app-settings";
import { SMS_TEXT, sendSms, smsConfig } from "@/lib/sms";

/**
 * Round 9, group 6: the automatic emails, one run at a time (the hourly job
 * and the daily cron call `runAutoEmails`):
 *
 *   roles_found        one digest a day at most, when the contact preference is email or both
 *   application_update self-tape requested, invited, contracted, declined (Candidature trigger)
 *   message_reply      a reply from the agent or the team still unread after an hour
 *   welcome            once, after the email is verified
 *
 * Who: in test mode (WORKFLOW_MODE not "live") only Test accounts, as the
 * founders decided; never a deleted, spam or revoked account. Each email has
 * a one-click unsubscribe for its category and a link to the email settings.
 * Every item is claimed (its emailedAt set) before the email goes out, so two
 * runs never send it twice; an item older than a week is never sent late.
 * The pause switch (group 9) stops all of it.
 */
const ALL = { en: enApp, fr: frApp, es: esApp, zh: zhApp } as const;
type Auto = (typeof enApp)["emails"]["auto"];
const strings = (l: Locale): Auto => (ALL[l] ?? ALL.en).emails.auto as Auto;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
/** Updates and replies older than this are never sent late (covers the daily run). */
const RECENT = 26 * HOUR;
/** A run stops claiming after this, well inside the 60 s function limit. */
const TIME_BUDGET_MS = 40_000;
const PER_RUN = 200;

export type AutoEmailCounts = Record<EmailCategory, number> & { skipped: boolean; roles_text?: number };

type Recipient = { id: string; email: string; locale: string; name: string };

/** Accounts that may get automatic emails right now. */
function recipientWhere(mode = workflowMode()) {
  return {
    deletedAt: null,
    kind: "TALENT",
    ...(mode === "live" ? { accountStatus: { notIn: ["SPAM", "REVOKED"] } } : { accountStatus: "TEST" }),
  };
}

async function send(r: Recipient, category: EmailCategory, base: string, build: (s: Auto, locale: Locale) => Omit<Parameters<typeof brandedEmail>[0], "footer" | "base" | "locale">, env: MailerEnv) {
  const locale = toLocale(r.locale);
  const s = strings(locale);
  const urls = unsubscribeUrls(base, locale, r.id, category);
  const parts = build(s, locale);
  const why = { roles_found: s.rolesWhy, application_update: s.updateWhy, message_reply: s.replyWhy, welcome: s.welcomeWhy }[category];
  const mail = brandedEmail({
    ...parts,
    locale,
    base,
    footer: {
      why,
      unsubscribeLabel: s.unsubscribe,
      unsubscribeUrl: urls.page,
      settingsLabel: s.settings,
      settingsUrl: `${base}/${locale}/talents/app/parametres?tab=notifications`,
      signature: s.signature,
    },
  });
  const res = await sendEmail(
    {
      to: r.email,
      kind: category,
      ...mail,
      headers: { "List-Unsubscribe": `<${urls.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    },
    { env }
  );
  return res.ok && res.mode === "resend";
}

export async function runAutoEmails(
  opts: { now?: Date; env?: MailerEnv; paused?: boolean; approved?: Set<EmailCategory> } = {}
): Promise<AutoEmailCounts> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const counts: AutoEmailCounts = { roles_found: 0, application_update: 0, message_reply: 0, welcome: 0, skipped: false };
  // Without a sender nothing is claimed: the items wait (for at most a week).
  // The pause switch (Admin > Controls) stops every automatic email and text.
  const paused = opts.paused ?? (await isPaused());
  if (paused || !emailSenderConfigured(env)) return { ...counts, skipped: true };
  // Founder rule: a category goes out only once staff approved it (Admin > Controls).
  const approved = opts.approved ?? (await approvedEmailCategories());
  if (approved.size === 0) return { ...counts, skipped: true };
  let base = "https://www.agental.co";
  try {
    base = siteBaseUrl(env);
  } catch {
    // The cron has no request host: the public site.
  }
  const who = recipientWhere(workflowMode(env));
  const weekAgo = new Date(now.getTime() - WEEK);
  const recent = new Date(now.getTime() - RECENT);
  const userSelect = { id: true, email: true, locale: true, name: true, artistProfile: { select: { stageName: true, roleAlertChannel: true } } } as const;
  const asRecipient = (u: { id: string; email: string; locale: string; name: string | null; artistProfile: { stageName: string | null } | null }): Recipient => ({
    id: u.id,
    email: u.email,
    locale: u.locale,
    name: (u.artistProfile?.stageName || u.name || "").trim().split(/\s+/)[0] ?? "",
  });

  // 1. Welcome: verified in the last week, never welcomed.
  const fresh = !approved.has("welcome") ? [] : await prisma.user.findMany({
    where: { ...who, welcomeEmailAt: null, emailVerified: { gte: weekAgo, lte: now } },
    take: PER_RUN,
    select: userSelect,
  });
  for (const u of fresh) {
    if (outOfTime()) break;
    const claimed = await prisma.user.updateMany({ where: { id: u.id, welcomeEmailAt: null }, data: { welcomeEmailAt: now } });
    if (claimed.count !== 1) continue;
    const r = asRecipient(u);
    const ok = await send(r, "welcome", base, (s, l) => ({
      subject: s.welcomeSubject,
      preheader: s.welcomePreheader,
      heading: r.name ? fill(s.welcomeHeading, { name: r.name }) : s.welcomeHeadingAnon,
      paragraphs: [s.welcomeIntro],
      items: s.welcomeItems.map((title) => ({ title })),
      cta: { label: s.welcomeCta, url: `${base}/${l}/talents/app` },
    }), env);
    if (ok) counts.welcome += 1;
    else await prisma.user.updateMany({ where: { id: u.id, welcomeEmailAt: now }, data: { welcomeEmailAt: null } });
  }

  // 2. Application updates: one email per update, the same hour.
  const updates = !approved.has("application_update") ? [] : await prisma.notification.findMany({
    where: { kind: "STATUS", emailedAt: null, createdAt: { gte: recent }, user: { ...who, notifyApplications: true } },
    orderBy: { createdAt: "asc" },
    take: PER_RUN,
    select: { id: true, payload: true, user: { select: userSelect } },
  });
  for (const n of updates) {
    if (outOfTime()) break;
    const claimed = await prisma.notification.updateMany({ where: { id: n.id, emailedAt: null }, data: { emailedAt: now } });
    if (claimed.count !== 1) continue;
    let p: { role?: unknown; status?: unknown } = {};
    try {
      p = JSON.parse(n.payload);
    } catch {
      p = {};
    }
    const status = typeof p.status === "string" ? p.status : "";
    const role = typeof p.role === "string" && p.role.trim() ? p.role.trim().slice(0, 120) : "";
    const ok = await send(asRecipient(n.user), "application_update", base, (s, l) => {
      const line = (s.update as Record<string, string>)[status];
      return {
        subject: fill(s.updateSubject, { role: role || s.updateHeading }),
        preheader: s.updatePreheader,
        heading: s.updateHeading,
        paragraphs: [line ? fill(line, { role: role || s.updateHeading }) : s.updatePreheader],
        cta: { label: s.updateCta, url: `${base}/${l}/talents/app/candidatures` },
      };
    }, env);
    if (ok) counts.application_update += 1;
    else await prisma.notification.updateMany({ where: { id: n.id, emailedAt: now }, data: { emailedAt: null } });
  }

  // 3. Replies unread for more than an hour: one email per performer, listing the count.
  const unread = !approved.has("message_reply") ? [] : await prisma.message.findMany({
    where: {
      OR: [{ fromTeam: true }, { fromAgent: true }],
      readAt: null,
      emailedAt: null,
      createdAt: { gte: recent, lte: new Date(now.getTime() - HOUR) },
      thread: { kind: "TEAM", hiddenForUserAt: null, user: { ...who, notifyMessages: true } },
    },
    // Grouped by conversation in order, so a performer's replies rarely split across runs.
    orderBy: [{ threadId: "asc" }, { createdAt: "asc" }],
    take: PER_RUN * 5,
    select: { id: true, fromTeam: true, fromAgent: true, thread: { select: { user: { select: userSelect } } } },
  });
  const byUser = new Map<string, typeof unread>();
  for (const m of unread) {
    const u = m.thread.user;
    if (!u) continue;
    byUser.set(u.id, [...(byUser.get(u.id) ?? []), m]);
  }
  for (const [, msgs] of byUser) {
    if (outOfTime()) break;
    const ids = msgs.map((m) => m.id);
    const claimed = await prisma.message.updateMany({ where: { id: { in: ids }, emailedAt: null }, data: { emailedAt: now } });
    if (claimed.count === 0) continue;
    const u = msgs[0].thread.user!;
    const team = msgs.some((m) => m.fromTeam);
    const agent = msgs.some((m) => m.fromAgent);
    const ok = await send(asRecipient(u), "message_reply", base, (s, l) => ({
      subject: s.replySubject,
      preheader: s.replyPreheader,
      heading: s.replyHeading,
      paragraphs: [fill(s.replyBody, { count: claimed.count, from: team && agent ? s.replyFromBoth : team ? s.replyFromTeam : s.replyFromAgent })],
      cta: { label: s.replyCta, url: `${base}/${l}/talents/app/messages` },
    }), env);
    if (ok) counts.message_reply += 1;
    else await prisma.message.updateMany({ where: { id: { in: ids }, emailedAt: now }, data: { emailedAt: null } });
  }

  // 4. Roles found: a digest at most once a day, if the contact preference includes email.
  const dayAgo = new Date(now.getTime() - 24 * HOUR);
  const found = !approved.has("roles_found") ? [] : await prisma.notification.findMany({
    where: {
      kind: "ROLE_FOUND",
      emailedAt: null,
      createdAt: { gte: weekAgo },
      user: {
        ...who,
        notifyRolesFound: true,
        OR: [{ rolesDigestAt: null }, { rolesDigestAt: { lte: dayAgo } }],
        artistProfile: { OR: [{ roleAlertChannel: null }, { roleAlertChannel: { in: ["email", "both"] } }] },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PER_RUN * 5,
    select: { id: true, payload: true, userId: true, user: { select: userSelect } },
  });
  const rolesByUser = new Map<string, typeof found>();
  for (const n of found) rolesByUser.set(n.userId, [...(rolesByUser.get(n.userId) ?? []), n]);
  for (const [userId, list] of rolesByUser) {
    if (outOfTime()) break;
    // The digest is claimed per performer: a second run the same day finds rolesDigestAt set.
    const claimed = await prisma.user.updateMany({
      where: { id: userId, OR: [{ rolesDigestAt: null }, { rolesDigestAt: { lte: dayAgo } }] },
      data: { rolesDigestAt: now },
    });
    if (claimed.count !== 1) continue;
    const ids = list.map((n) => n.id);
    await prisma.notification.updateMany({ where: { id: { in: ids }, emailedAt: null }, data: { emailedAt: now } });
    const titles = list.slice(0, 8).map((n) => {
      try {
        const role = (JSON.parse(n.payload) as { role?: unknown }).role;
        return typeof role === "string" && role.trim() ? role.trim().slice(0, 120) : null;
      } catch {
        return null;
      }
    });
    const ok = await send(asRecipient(list[0].user), "roles_found", base, (s, l) => ({
      subject: s.rolesSubject,
      preheader: s.rolesPreheader,
      heading: fill(s.rolesHeading, { count: list.length }),
      paragraphs: [s.rolesIntro],
      items: titles.filter((t): t is string => !!t).map((title) => ({ title })),
      cta: { label: s.rolesCta, url: `${base}/${l}/talents/app/candidatures` },
    }), env);
    if (ok) counts.roles_found += 1;
    else {
      await prisma.notification.updateMany({ where: { id: { in: ids }, emailedAt: now }, data: { emailedAt: null } });
      await prisma.user.updateMany({ where: { id: userId, rolesDigestAt: now }, data: { rolesDigestAt: null } });
    }
  }

  // 5. Round 9, group 8: the "roles found" text, behind SMS_ENABLED (off). Text or Both,
  //    consent given, a US number, no STOP; at most one a day; same approval and test-mode gates.
  // Daytime only in the US: 17:00 to 01:00 UTC is 9am to 5pm Pacific and noon to 8pm Eastern.
  const utcHour = now.getUTCHours();
  const daytime = utcHour >= 17 || utcHour < 1;
  if (smsConfig(env) && approved.has("roles_found") && daytime) {
    counts.roles_text = 0;
    const texters = await prisma.user.findMany({
      where: {
        ...who,
        OR: [{ rolesTextAt: null }, { rolesTextAt: { lte: dayAgo } }],
        artistProfile: { roleAlertChannel: { in: ["sms", "both"] }, smsConsentAt: { not: null }, smsOptOutAt: null, phoneE164: { startsWith: "+1" } },
        // Only performers with something to say, the longest waiting first.
        notifications: { some: { kind: "ROLE_FOUND", createdAt: { gt: weekAgo } } },
      },
      orderBy: { rolesTextAt: { sort: "asc", nulls: "first" } },
      take: PER_RUN,
      select: { id: true, locale: true, rolesTextAt: true, artistProfile: { select: { phoneE164: true } } },
    });
    for (const u of texters) {
      if (outOfTime()) break;
      const since = u.rolesTextAt && u.rolesTextAt > weekAgo ? u.rolesTextAt : weekAgo;
      const n = await prisma.notification.count({ where: { userId: u.id, kind: "ROLE_FOUND", createdAt: { gt: since } } });
      if (n === 0) continue;
      const claimed = await prisma.user.updateMany({ where: { id: u.id, OR: [{ rolesTextAt: null }, { rolesTextAt: { lte: dayAgo } }] }, data: { rolesTextAt: now } });
      if (claimed.count !== 1) continue;
      const res = await sendSms(u.artistProfile!.phoneE164!, SMS_TEXT.rolesFound(n, `${base}/${toLocale(u.locale)}/talents/app/candidatures`), { userId: u.id, kind: "roles_found" }, { env });
      if (res.ok) counts.roles_text += 1;
      // A temporary failure gives the day back; a refused number keeps it (no retry every hour).
      else if (!res.permanent) await prisma.user.updateMany({ where: { id: u.id, rolesTextAt: now }, data: { rolesTextAt: u.rolesTextAt } });
    }
  }
  return counts;
}
