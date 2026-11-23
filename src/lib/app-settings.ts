import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EMAIL_CATEGORIES, type EmailCategory } from "@/lib/email-unsubscribe";

/**
 * Round 9: the switches staff change in Admin > Controls. Stored in
 * AppSetting, read fresh on every run (no cache), every change audited.
 *
 *   emails.approved   the automatic email categories staff approved (founder
 *                     rule: no category goes out without a staff approval);
 *                     none by default.
 *   pause             (group 9) everything automatic stopped at once.
 */
const APPROVED_KEY = "emails.approved";

export async function approvedEmailCategories(): Promise<Set<EmailCategory>> {
  const row = await prisma.appSetting.findUnique({ where: { key: APPROVED_KEY } });
  try {
    const list = JSON.parse(row?.value ?? "[]") as unknown;
    return new Set(Array.isArray(list) ? EMAIL_CATEGORIES.filter((c) => list.includes(c)) : []);
  } catch {
    return new Set();
  }
}

export async function setEmailCategoryApproved(adminId: string, category: EmailCategory, approved: boolean): Promise<void> {
  const current = await approvedEmailCategories();
  const before = [...current];
  if (approved) current.add(category);
  else current.delete(category);
  const value = JSON.stringify([...current].sort());
  // Turning a category on never sends its backlog: what is already waiting counts as handled.
  if (approved && !before.includes(category)) {
    const now = new Date();
    if (category === "application_update") await prisma.notification.updateMany({ where: { kind: "STATUS", emailedAt: null }, data: { emailedAt: now } });
    if (category === "roles_found") await prisma.notification.updateMany({ where: { kind: "ROLE_FOUND", emailedAt: null }, data: { emailedAt: now } });
    if (category === "message_reply") await prisma.message.updateMany({ where: { emailedAt: null, OR: [{ fromTeam: true }, { fromAgent: true }] }, data: { emailedAt: now } });
  }
  await prisma.appSetting.upsert({
    where: { key: APPROVED_KEY },
    create: { key: APPROVED_KEY, value, updatedById: adminId },
    update: { value, updatedById: adminId },
  });
  await audit({ actorUserId: adminId, action: "admin.emails.approval", resourceType: "AppSetting", resourceId: APPROVED_KEY, before: { approved: before }, after: { approved: [...current] } });
}

// ------------------------------------------------------------------ pause

/**
 * Round 9, group 9: one switch that stops everything automatic at once:
 * AI searches (n8n claims nothing), the assistant's model (rules answers),
 * automatic emails and texts, and drafted replies (n8n claims and drafts are
 * refused). Read fresh on every call, so it takes effect immediately; staff
 * can still answer by hand. Every change audited.
 */
const PAUSE_KEY = "pause";

export interface PauseState {
  paused: boolean;
  since: string | null;
  by: string | null;
}

export async function pauseState(): Promise<PauseState> {
  const row = await prisma.appSetting.findUnique({ where: { key: PAUSE_KEY } });
  try {
    const v = JSON.parse(row?.value ?? "{}") as { paused?: unknown; since?: unknown };
    return { paused: v.paused === true, since: typeof v.since === "string" ? v.since : null, by: row?.updatedById ?? null };
  } catch {
    return { paused: false, since: null, by: null };
  }
}

/** True while paused. Never throws: an unreadable setting counts as paused (fail safe). */
export async function isPaused(): Promise<boolean> {
  try {
    return (await pauseState()).paused;
  } catch {
    return true;
  }
}

export async function setPaused(adminId: string, paused: boolean, now = new Date()): Promise<void> {
  const before = await pauseState();
  const value = JSON.stringify({ paused, since: paused ? now.toISOString() : null });
  await prisma.appSetting.upsert({
    where: { key: PAUSE_KEY },
    create: { key: PAUSE_KEY, value, updatedById: adminId },
    update: { value, updatedById: adminId },
  });
  await audit({ actorUserId: adminId, action: paused ? "admin.pause.on" : "admin.pause.off", resourceType: "AppSetting", resourceId: PAUSE_KEY, before: { paused: before.paused }, after: { paused } });
}
